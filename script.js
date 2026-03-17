// --- DOM Elements ---
const inputAll = document.getElementById('csv-all');
const inputPrices = document.getElementById('csv-prices');
const btnReset = document.getElementById('btn-reset'); 
const btnHelp = document.getElementById('help-btn'); 
const leftActionContainer = document.getElementById('left-action-container');
const typeFilter = document.getElementById('type-filter');
const profileFilter = document.getElementById('profile-filter');
const taxType = document.getElementById('tax-type'); 
const taxInputsContainer = document.getElementById('tax-inputs-container'); 
const taxInput1 = document.getElementById('tax-input-1');
const taxInput2 = document.getElementById('tax-input-2');
const taxInput3 = document.getElementById('tax-input-3');
const taxInput4 = document.getElementById('tax-input-4');
const tableContainer = document.getElementById('table-container');

// JSON DOM Elements
const jsonInput = document.getElementById('json-input');
const jsonDisplay = document.getElementById('json-display');
const totalsBadge = document.getElementById('totals-badge'); 
const badgePaid = document.getElementById('badge-paid');
const badgeCalc = document.getElementById('badge-calc');
const btnFilterRed = document.getElementById('btn-filter-red'); 
const btnDownloadCsv = document.getElementById('btn-download-csv'); 
const accountingGroupsContainer = document.getElementById('accounting-groups'); 

// Modal DOM Elements
const customModal = document.getElementById('custom-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const customModalTitle = document.getElementById('custom-modal-title');
const customModalText = document.getElementById('custom-modal-text');
const customModalClose = document.getElementById('custom-modal-close');

// --- STATE VARIABLES ---
let itemDB = {};   
let priceDB = {};  
let allData = [];
let filesLoaded = false;
let groupTaxMapping = new Map(); 
let showMismatchesOnly = false; 

// --- MODAL LOGIC & HELP INSTRUCTIONS ---
window.showInfoModal = function(text, title = "Item Details") {
    customModalTitle.innerHTML = title;
    customModalText.innerHTML = text;
    customModal.style.display = 'block';
    modalBackdrop.style.display = 'block';
};

function closeInfoModal() {
    customModal.style.display = 'none';
    modalBackdrop.style.display = 'none';
}

customModalClose.addEventListener('click', closeInfoModal);
modalBackdrop.addEventListener('click', closeInfoModal);

btnHelp.addEventListener('click', () => {
    const helpInstructions = `
        <ol style="padding-left: 20px; margin-top: 0; margin-bottom: 0;">
            <li style="margin-bottom: 10px;"><strong>Upload CSV Files:</strong> Upload your <em>Lightspeed formatted file</em> and your <em>Prices only</em> CSV.</li>
            <li style="margin-bottom: 10px;"><strong>Configure Taxes:</strong> Select an Account Profile, choose Tax Exclusive or Inclusive, and enter your different Tax Percentages (T1 through T4).</li>
            <li style="margin-bottom: 10px;"><strong>Map Accounting Groups:</strong> Expand the Tax Mapping menu to assign specific tax rates to specific accounting groups (or mark them Tax-Free).</li>
            <li style="margin-bottom: 10px;"><strong>Analyze Order:</strong> Paste an online order JSON payload into the "JSON Extractor" field.</li>
            <li><strong>Compare:</strong> The tool will pull in the online item prices, apply the exact taxes mapped to each item, and calculate the expected POS Base total!</li>
        </ol>
    `;
    showInfoModal(helpInstructions, "How to Use the Comparator");
});

// --- Download CSV Logic ---
btnDownloadCsv.addEventListener('click', () => {
    const table = jsonDisplay.querySelector('table');
    if (!table) return;

    let csvRows = [];
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
        let rowData = [];
        const cols = row.querySelectorAll('th, td');
        
        cols.forEach(col => {
            let text = col.innerText || col.textContent; 
            text = text.trim();
            text = text.replace(/"/g, '""');
            
            if (text.search(/("|,|\n)/g) >= 0) {
                text = `"${text}"`;
            }
            rowData.push(text);
        });
        
        csvRows.push(rowData.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "price_comparison.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// --- Toggle the Red Mismatch Filter ---
btnFilterRed.addEventListener('click', () => {
    showMismatchesOnly = !showMismatchesOnly;
    if (showMismatchesOnly) {
        btnFilterRed.classList.add('active');
        btnFilterRed.textContent = 'Show All Rows';
    } else {
        btnFilterRed.classList.remove('active');
        btnFilterRed.textContent = 'Show Red Only';
    }
    renderJSON();
});

// --- Helper to get the correct tax % for an item ---
function getTaxConfig(accountingGroup) {
    let taxLevel = 1; 
    
    if (accountingGroup && groupTaxMapping.has(accountingGroup)) {
        taxLevel = parseInt(groupTaxMapping.get(accountingGroup));
    }

    let percentage = 0;
    if (taxLevel === 1) percentage = parseFloat(taxInput1.value) || 0;
    else if (taxLevel === 2) percentage = parseFloat(taxInput2.value) || 0;
    else if (taxLevel === 3) percentage = parseFloat(taxInput3.value) || 0;
    else if (taxLevel === 4) percentage = parseFloat(taxInput4.value) || 0;

    return { level: taxLevel, percentage: percentage };
}

function generateTaxBadge(taxLevel) {
    if (taxLevel === 0) return `<span class="tax-badge tb-0">Tax-Free</span>`;
    
    let pct = "0";
    if (taxLevel === 1) pct = taxInput1.value !== "" ? taxInput1.value : "0";
    else if (taxLevel === 2) pct = taxInput2.value !== "" ? taxInput2.value : "0";
    else if (taxLevel === 3) pct = taxInput3.value !== "" ? taxInput3.value : "0";
    else if (taxLevel === 4) pct = taxInput4.value !== "" ? taxInput4.value : "0";
    
    return `<span class="tax-badge tb-${taxLevel}">${pct}%</span>`;
}

// --- Helper to trace hierarchy and find Group overrides ---
function getGroupOverridePrice(parentSku, childSku, currentProfile) {
    let pData = itemDB[parentSku];
    if (!pData) return null;

    if (pData.Type && pData.Type.toLowerCase() === 'group') {
        let pPrice = getPriceInfo(parentSku, currentProfile);
        if (pPrice.raw !== null && !isNaN(pPrice.raw)) return pPrice;
    }

    if (pData.children && pData.children.length > 0) {
        for (let midSku of pData.children) {
            let midData = itemDB[midSku];
            if (midData && midData.Type && midData.Type.toLowerCase() === 'group') {
                if (midData.children && midData.children.includes(childSku)) {
                    let midPrice = getPriceInfo(midSku, currentProfile);
                    if (midPrice.raw !== null && !isNaN(midPrice.raw)) return midPrice;
                }
            }
        }
    }
    return null;
}

// --- Centralized JSON Extractor Logic ---
function renderJSON() {
    const rawText = jsonInput.value.trim();
    if (!rawText) { 
        jsonDisplay.innerHTML = ""; 
        totalsBadge.style.display = "none"; 
        return; 
    }

    try {
        const startIndex = rawText.indexOf('{');
        const endIndex = rawText.lastIndexOf('}');
        if (startIndex === -1 || endIndex === -1) throw new Error("Could not detect a valid JSON object in the text.");

        const jsonString = rawText.substring(startIndex, endIndex + 1);
        const parsedData = JSON.parse(jsonString);

        const paymentAmount = parsedData?.payment?.paymentAmount || "0.00";
        const items = parsedData?.items || [];

        let grandTotal = 0;
        let currentTaxMode = taxType.value; 
        let isExclusive = currentTaxMode === 'exclusive';
        let currentProfile = profileFilter.value || 'Default';
        
        if (items.length > 0) {
            
            let tbodyHtml = `<tbody>`;
            let renderedRowsCount = 0; 
            
            items.forEach((item, index) => {
                const sku = item.sku || "N/A";
                const qty = item.quantity || 1;
                
                const itemData = itemDB[sku];
                const itemName = itemData ? itemData.Name : (item.customItemName || "Unknown Item");
                const itemAccGroup = itemData ? itemData.AccountingGroup : null;
                const displayAccGroup = itemAccGroup ? itemAccGroup : `<span style="color: #a0aec0; font-style: italic;">None</span>`;
                
                let onlinePriceRaw = (item.customItemPrice !== null && item.customItemPrice !== undefined) ? parseFloat(item.customItemPrice) : null;
                let onlinePriceDisplay = onlinePriceRaw !== null && !isNaN(onlinePriceRaw) ? `$${onlinePriceRaw.toFixed(2)}` : "-";
                
                let pInfo = getPriceInfo(sku, currentProfile);
                let rawPrice = (pInfo.raw !== null && !isNaN(pInfo.raw)) ? pInfo.raw : 0;
                
                let taxCfg = getTaxConfig(itemAccGroup);
                let taxBadge = generateTaxBadge(taxCfg.level);

                let priceWithTax = rawPrice;
                if (isExclusive) {
                    priceWithTax = rawPrice * (1 + (taxCfg.percentage / 100));
                }

                let lineTotal = priceWithTax * qty;
                grandTotal += lineTotal;

                let taxCell = isExclusive ? `<td>${taxBadge}</td>` : '';

                let isMismatch = false;
                let totalCellAttr = `style="font-weight: 500; color: #2b6cb0;"`;
                
                if (onlinePriceRaw === null || isNaN(onlinePriceRaw)) {
                    totalCellAttr = `style="font-weight: bold; color: #9b2c2c; background-color: #fed7d7;" title="Price missing online!"`;
                    isMismatch = true;
                } else if (onlinePriceRaw.toFixed(2) !== lineTotal.toFixed(2)) {
                    totalCellAttr = `style="font-weight: bold; color: #9b2c2c; background-color: #fed7d7;" title="Price mismatch! Online: $${onlinePriceRaw.toFixed(2)}"`;
                    isMismatch = true;
                }

                if (!showMismatchesOnly || isMismatch) {
                    tbodyHtml += `
                        <tr>
                            <td>${index + 1}</td>
                            <td style="font-weight: bold; color: #4a5568;">${sku}</td>
                            <td style="color: #4a5568;">${itemName}</td>
                            ${taxCell}
                            <td style="color: #4a5568;">${displayAccGroup}</td>
                            <td>${qty}</td>
                            <td style="color: #d69e2e; font-weight: 500;">${onlinePriceDisplay}</td>
                            <td ${totalCellAttr}>$${lineTotal.toFixed(2)}</td>
                        </tr>
                    `;
                    renderedRowsCount++;
                }

                if (item.subItems && item.subItems.length > 0) {
                    item.subItems.forEach((subItem) => {
                        const subSku = subItem.sku || "N/A";
                        const subQty = subItem.quantity || 1;
                        
                        const subItemData = itemDB[subSku];
                        let subItemName = subItemData ? subItemData.Name : (subItem.customItemName || "Unknown Item");
                        const subItemAccGroup = subItemData ? subItemData.AccountingGroup : null;
                        const subDisplayAccGroup = subItemAccGroup ? subItemAccGroup : `<span style="color: #a0aec0; font-style: italic;">None</span>`;

                        let subOnlinePriceRaw = (subItem.customItemPrice !== null && subItem.customItemPrice !== undefined) ? parseFloat(subItem.customItemPrice) : null;
                        let subOnlinePriceDisplay = subOnlinePriceRaw !== null && !isNaN(subOnlinePriceRaw) ? `$${subOnlinePriceRaw.toFixed(2)}` : "-";

                        let subPInfo = getPriceInfo(subSku, currentProfile);
                        let subRawPrice = (subPInfo.raw !== null && !isNaN(subPInfo.raw)) ? subPInfo.raw : 0;

                        let overridePInfo = getGroupOverridePrice(sku, subSku, currentProfile);
                        if (overridePInfo) {
                            subRawPrice = overridePInfo.raw;
                            subItemName += ` <span title="Price inherited from parent Group" style="font-size:0.6rem; background:#ebf8ff; color:#2b6cb0; padding:2px 5px; border-radius:4px; margin-left:6px; vertical-align: middle;">Group</span>`;
                        }

                        let subTaxCfg = getTaxConfig(subItemAccGroup);
                        let subTaxBadge = generateTaxBadge(subTaxCfg.level);

                        let subPriceWithTax = subRawPrice;
                        if (isExclusive) {
                            subPriceWithTax = subRawPrice * (1 + (subTaxCfg.percentage / 100));
                        }

                        let subLineTotal = subPriceWithTax * subQty;
                        grandTotal += subLineTotal;

                        let subTaxCell = isExclusive ? `<td>${subTaxBadge}</td>` : '';

                        let isSubMismatch = false;
                        let subTotalCellAttr = `style="color: #718096; font-size: 0.75rem;"`;
                        
                        if (subOnlinePriceRaw === null || isNaN(subOnlinePriceRaw)) {
                            subTotalCellAttr = `style="font-weight: bold; color: #9b2c2c; background-color: #fed7d7; font-size: 0.75rem;" title="Price missing online!"`;
                            isSubMismatch = true;
                        } else if (subOnlinePriceRaw.toFixed(2) !== subLineTotal.toFixed(2)) {
                            subTotalCellAttr = `style="font-weight: bold; color: #9b2c2c; background-color: #fed7d7; font-size: 0.75rem;" title="Price mismatch! Online: $${subOnlinePriceRaw.toFixed(2)}"`;
                            isSubMismatch = true;
                        }

                        if (!showMismatchesOnly || isSubMismatch) {
                            tbodyHtml += `
                                <tr>
                                    <td></td>
                                    <td style="padding-left: 25px; color: #718096; font-size: 0.75rem;">
                                        <span style="color: #cbd5e0; margin-right: 4px;">↳</span>${subSku}
                                    </td>
                                    <td style="color: #718096; font-size: 0.75rem;">${subItemName}</td>
                                    ${subTaxCell}
                                    <td style="color: #718096; font-size: 0.75rem;">${subDisplayAccGroup}</td>
                                    <td style="color: #718096; font-size: 0.75rem;">${subQty}</td>
                                    <td style="color: #d69e2e; font-size: 0.75rem;">${subOnlinePriceDisplay}</td>
                                    <td ${subTotalCellAttr}>$${subLineTotal.toFixed(2)}</td>
                                </tr>
                            `;
                            renderedRowsCount++;
                        }
                    });
                }
            });

            tbodyHtml += `</tbody>`;

            let taxHeader = isExclusive ? `<th>Tax</th>` : '';

            let theadHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item SKU</th>
                            <th>Item Name</th>
                            ${taxHeader}
                            <th>Acc. Group</th>
                            <th>Quantity</th>
                            <th>Online Price</th>
                            <th>Total (w/ Tax)</th>
                        </tr>
                    </thead>
            `;

            if (showMismatchesOnly && renderedRowsCount === 0) {
                jsonDisplay.innerHTML = `<div style="padding: 20px; color: #38a169; font-weight: bold; text-align: center; background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 6px; margin: 15px;">No mismatches found! All prices match perfectly. 🎉</div>`;
            } else {
                jsonDisplay.innerHTML = theadHtml + tbodyHtml + `</table>`;
            }

            badgePaid.textContent = `💰 Paid Online: $${paymentAmount}`;
            badgeCalc.textContent = `📊 Expected Payment: $${grandTotal.toFixed(2)}`;
            totalsBadge.style.display = "flex";

        } else {
            jsonDisplay.innerHTML = `<div style="color: #a0aec0; font-style: italic; font-size: 0.85rem; padding: 15px;">(No items found in payload)</div>`;
            totalsBadge.style.display = "none";
        }
    } catch (error) {
        jsonDisplay.innerHTML = `<div style="color: #e53e3e; font-weight: bold; padding: 15px;">Extraction Error:</div><div style="color: #fc8181; padding: 0 15px;">${error.message}</div>`;
        totalsBadge.style.display = "none"; 
    }
}

jsonInput.addEventListener('input', renderJSON);

// AUTOMATIC TRIGGER
function checkInputs() {
    if (inputAll.files.length > 0 && inputPrices.files.length > 0) {
        runCSVProcessing();
    }
}
inputAll.addEventListener('change', checkInputs);
inputPrices.addEventListener('change', checkInputs);

// Reset Button Logic
btnReset.addEventListener('click', () => {
    inputAll.value = "";
    inputPrices.value = "";
    jsonInput.value = "";
    itemDB = {};
    priceDB = {};
    allData = [];
    filesLoaded = false;
    groupTaxMapping.clear();
    
    showMismatchesOnly = false;
    btnFilterRed.classList.remove('active');
    btnFilterRed.textContent = 'Show Red Only';

    document.getElementById('output-placeholder').style.display = 'block';
    leftActionContainer.style.display = 'none';
    tableContainer.innerHTML = "";
    jsonDisplay.innerHTML = "";
    totalsBadge.style.display = "none"; 
    accountingGroupsContainer.style.display = "none"; 
    accountingGroupsContainer.innerHTML = "";
    taxType.value = "exclusive"; 
    taxInputsContainer.style.display = 'flex';
    taxInput1.value = "";
    taxInput2.value = "";
    taxInput3.value = "";
    taxInput4.value = "";
    closeInfoModal();
});

function runCSVProcessing() {
    document.getElementById('output-placeholder').style.display = 'none';
    tableContainer.innerHTML = "<div style='padding:20px;'>Loading files and mapping hierarchy...</div>";

    Papa.parse(inputAll.files[0], {
        header: true,
        skipEmptyLines: true,
        complete: function(resultsAll) {
            allData = resultsAll.data;
            itemDB = {}; 

            Papa.parse(inputPrices.files[0], {
                header: true,
                skipEmptyLines: true,
                complete: function(resultsPrices) {
                    let pricesData = resultsPrices.data;
                    priceDB = {};
                    let uniqueProfiles = new Set();

                    // --- POPULATE ACCOUNTING GROUPS WITH DROPDOWNS ---
                    const uniqueAccountingGroups = [...new Set(allData.map(row => {
                        let grp = row['Accounting group'] || row['Accounting Group'];
                        return grp ? grp.trim() : '';
                    }).filter(Boolean))];
                    
                    uniqueAccountingGroups.sort((a, b) => {
                        const valA = a.toLowerCase();
                        const valB = b.toLowerCase();
                        if (valA < valB) return -1;
                        if (valA > valB) return 1;
                        return 0;
                    });
                    
                    groupTaxMapping.clear(); 

                    if (uniqueAccountingGroups.length > 0) {
                        
                        accountingGroupsContainer.innerHTML = `
                            <div class="ag-header" id="ag-toggle" title="Click to expand/collapse">
                                <span>Tax Mapping</span>
                                <span id="ag-arrow" style="font-size: 0.8rem; color: #718096;">▼</span>
                            </div>
                            <div id="ag-cards-wrapper"></div>
                        `;
                        
                        const cardsWrapper = document.getElementById('ag-cards-wrapper');
                        const agToggle = document.getElementById('ag-toggle');
                        const agArrow = document.getElementById('ag-arrow');
                        
                        agToggle.addEventListener('click', () => {
                            if (cardsWrapper.style.display === 'none' || cardsWrapper.style.display === '') {
                                cardsWrapper.style.display = 'block';
                                agArrow.textContent = '▲';
                            } else {
                                cardsWrapper.style.display = 'none';
                                agArrow.textContent = '▼';
                            }
                        });

                        const v1 = taxInput1.value !== "" ? taxInput1.value : "0";
                        const v2 = taxInput2.value !== "" ? taxInput2.value : "0";
                        const v3 = taxInput3.value !== "" ? taxInput3.value : "0";
                        const v4 = taxInput4.value !== "" ? taxInput4.value : "0";

                        uniqueAccountingGroups.forEach(groupName => {
                            groupTaxMapping.set(groupName, 1); 
                            
                            let card = document.createElement('div');
                            card.className = 'ag-card';
                            
                            card.innerHTML = `
                                <span class="ag-card-name" title="${groupName}">${groupName}</span>
                                <select class="ag-card-select">
                                    <option value="1">${v1}%</option>
                                    <option value="2">${v2}%</option>
                                    <option value="3">${v3}%</option>
                                    <option value="4">${v4}%</option>
                                    <option value="0">Tax-Free</option>
                                </select>
                            `;
                            
                            const selectElement = card.querySelector('select');
                            selectElement.addEventListener('change', (e) => {
                                groupTaxMapping.set(groupName, parseInt(e.target.value));
                                renderTable(typeFilter.value, profileFilter.value);
                                renderJSON();
                            });
                            
                            cardsWrapper.appendChild(card);
                        });
                        
                        if (taxType.value === 'exclusive') {
                            accountingGroupsContainer.style.display = 'block';
                        } else {
                            accountingGroupsContainer.style.display = 'none';
                        }
                    } else {
                        accountingGroupsContainer.style.display = 'none';
                    }

                    // --- BUILD PRICE DATABASE ---
                    pricesData.forEach(row => {
                        let sku = row['SKU'];
                        if (!sku) return;
                        let profile = (row['Account profile'] && row['Account profile'].trim() !== '') ? row['Account profile'].trim() : 'Default';
                        if (profile !== 'Default') uniqueProfiles.add(profile);
                        if (!priceDB[sku]) priceDB[sku] = {};
                        priceDB[sku][profile] = row['Price'];
                    });

                    // --- STORE ACCOUNTING GROUP & SHARING STATUS IN itemDB ---
                    allData.forEach(row => {
                        if (row['Type'] && row['Type'].trim() !== '') {
                            let ag = row['Accounting group'] || row['Accounting Group']; 
                            let sharing = row['Sharing status'] || ''; 
                            
                            itemDB[row['SKU']] = { 
                                SKU: row['SKU'], 
                                Name: row['Name'], 
                                Type: row['Type'], 
                                AccountingGroup: ag ? ag.trim() : '',
                                SharingStatus: sharing.trim(), 
                                children: [] 
                            };
                        }
                    });

                    allData.forEach(row => {
                        let parentSku = row['Parent SKU'];
                        let childSku = row['SKU'];
                        if (parentSku && itemDB[parentSku]) {
                            if (!itemDB[parentSku].children.includes(childSku)) {
                                itemDB[parentSku].children.push(childSku);
                            }
                        }
                    });

                    typeFilter.innerHTML = `<option value="ALL">Show All (Flat View)</option>`;
                    const uniqueTypes = [...new Set(Object.values(itemDB).map(item => item.Type))].filter(Boolean);
                    uniqueTypes.forEach(type => { typeFilter.innerHTML += `<option value="${type}">${type}</option>`; });

                    profileFilter.innerHTML = `<option value="Default">Default Price</option>`;
                    uniqueProfiles.forEach(prof => { profileFilter.innerHTML += `<option value="${prof}">${prof}</option>`; });
                    
                    filesLoaded = true;
                    leftActionContainer.style.display = 'flex';
                    renderTable(typeFilter.value, profileFilter.value);
                    renderJSON(); 
                }
            });
        }
    });
}

typeFilter.addEventListener('change', () => { renderTable(typeFilter.value, profileFilter.value); });
profileFilter.addEventListener('change', () => { renderTable(typeFilter.value, profileFilter.value); renderJSON(); });

taxType.addEventListener('change', () => { 
    let isExclusive = taxType.value === 'exclusive';
    
    if (isExclusive && groupTaxMapping.size > 0) {
        accountingGroupsContainer.style.display = 'block';
    } else {
        accountingGroupsContainer.style.display = 'none';
    }

    if (isExclusive) {
        taxInputsContainer.style.display = 'flex';
    } else {
        taxInputsContainer.style.display = 'none';
    }

    if (filesLoaded) { 
        renderTable(typeFilter.value, profileFilter.value); 
        renderJSON(); 
    } 
});

const updateTaxes = () => { 
    if (filesLoaded) { 
        const selects = document.querySelectorAll('.ag-card-select');
        const v1 = (taxInput1.value !== "" ? taxInput1.value : "0") + "%";
        const v2 = (taxInput2.value !== "" ? taxInput2.value : "0") + "%";
        const v3 = (taxInput3.value !== "" ? taxInput3.value : "0") + "%";
        const v4 = (taxInput4.value !== "" ? taxInput4.value : "0") + "%";
        
        selects.forEach(select => {
            if (select.options.length > 0) select.options[0].text = v1;
            if (select.options.length > 1) select.options[1].text = v2;
            if (select.options.length > 2) select.options[2].text = v3;
            if (select.options.length > 3) select.options[3].text = v4;
        });

        renderTable(typeFilter.value, profileFilter.value); 
        renderJSON(); 
    } 
};
taxInput1.addEventListener('input', updateTaxes);
taxInput2.addEventListener('input', updateTaxes);
taxInput3.addEventListener('input', updateTaxes);
taxInput4.addEventListener('input', updateTaxes);

function getPriceInfo(sku, profileValue) {
    if (!priceDB[sku]) return { text: "", raw: null, isFallback: false }; 
    
    if (profileValue === 'Default') {
        let p = priceDB[sku]['Default'];
        let exists = p !== undefined && p !== "";
        return exists ? { text: p, raw: parseFloat(p), isFallback: false } : { text: "", raw: null, isFallback: false }; 
    } else {
        let p = priceDB[sku][profileValue];
        if (p !== undefined && p !== "") return { text: p, raw: parseFloat(p), isFallback: false };
        
        let def = priceDB[sku]['Default'];
        if (def !== undefined && def !== "") return { text: def, raw: parseFloat(def), isFallback: true };
        
        return { text: "", raw: null, isFallback: false }; 
    }
}

function renderTable(typeValue, profileValue) {
    let isExclusive = taxType.value === 'exclusive';
    let taxHeaderHTML = isExclusive ? `<th style="color: #d69e2e;">Price (w/ Tax)</th>` : '';

    let html = `
        <table>
            <thead>
                <tr>
                    <th>SKU & Hierarchy</th>
                    <th>Name</th>
                    <th>Price</th>
                    ${taxHeaderHTML}
                </tr>
            </thead>
            <tbody>
    `;

    let mainList = Object.values(itemDB);

    if (typeValue === "ALL") {
        mainList.forEach(item => { html += generateRowHTML(item, "flat", profileValue); });
    } else {
        let filteredData = mainList.filter(item => item.Type === typeValue);
        filteredData.forEach(item => {
            
            let rootGroupOverrideObj = null;
            let checkTypeStr = item.Type ? item.Type.toLowerCase() : "";
            if (checkTypeStr === 'group') {
                let groupPrice = getPriceInfo(item.SKU, profileValue);
                if (groupPrice.raw !== null && !isNaN(groupPrice.raw)) {
                    rootGroupOverrideObj = groupPrice;
                }
            }

            html += generateRowHTML(item, "combo", profileValue); 
            
            item.children.forEach(childSku => {
                let childItem = itemDB[childSku];
                if (childItem) {
                    let childTypeStr = childItem.Type ? childItem.Type.toLowerCase() : "";
                    
                    let levelClass = (checkTypeStr === 'group') ? 'group' : (childTypeStr === 'group' ? 'group' : 'item');
                    
                    let currentOverrideObj = rootGroupOverrideObj;
                    if (childTypeStr === 'group') {
                        let childGroupPrice = getPriceInfo(childItem.SKU, profileValue);
                        if (childGroupPrice.raw !== null && !isNaN(childGroupPrice.raw)) {
                            currentOverrideObj = childGroupPrice;
                        }
                    }
                    
                    html += generateRowHTML(childItem, levelClass, profileValue, currentOverrideObj);
                    
                    if (childItem.children.length > 0) {
                        childItem.children.forEach(grandChildSku => {
                            let grandChildItem = itemDB[grandChildSku];
                            if (grandChildItem) {
                                html += generateRowHTML(grandChildItem, "item", profileValue, currentOverrideObj);
                            }
                        });
                    }
                }
            });
        });
    }

    html += `</tbody></table>`;
    tableContainer.innerHTML = html;
}

function generateRowHTML(item, level, profileValue, inheritedPriceObj = null) {
    let rowClass = level !== "flat" ? `level-${level}` : "";
    
    let priceText;
    let isFallback = false;
    let isInherited = false;
    let rawCalcPrice = null;

    if (inheritedPriceObj) {
        priceText = inheritedPriceObj.text;
        rawCalcPrice = inheritedPriceObj.raw;
        isFallback = inheritedPriceObj.isFallback;
        isInherited = true;
    } else {
        let pInfo = getPriceInfo(item.SKU, profileValue);
        priceText = pInfo.text;
        rawCalcPrice = pInfo.raw;
        isFallback = pInfo.isFallback;
    }

    let isExclusive = taxType.value === 'exclusive';
    let afterTaxCell = ""; 

    if (isExclusive) {
        let afterTaxText = "";
        if (rawCalcPrice !== null && !isNaN(rawCalcPrice)) {
            let taxCfg = getTaxConfig(item.AccountingGroup);
            let finalPrice = rawCalcPrice * (1 + (taxCfg.percentage / 100));
            afterTaxText = finalPrice.toFixed(2);
        }
        afterTaxCell = `<td style="font-weight: 500;">${afterTaxText}</td>`;
    }

    let priceHtml = `<td>${priceText}</td>`;
    
    if (isInherited) {
        priceHtml = `<td><span title="Price overridden by parent Group" style="color: #2b6cb0; font-weight: 600;">${priceText} <span style="font-size:0.65rem; background:#ebf8ff; padding:2px 4px; border-radius:4px;">Group</span></span></td>`;
    } else if (isFallback) {
        priceHtml = `<td><span title="No profile price found. Falling back to default." style="color: #a0aec0; font-style: italic;">${priceText}*</span></td>`;
    }

    // NEW: Assign specific color classes based on the Sharing Status value
    let sharingHtml = '';
    if (item.SharingStatus) {
        let sClass = 'sharing-local'; 
        let sText = item.SharingStatus.toLowerCase();
        if (sText === 'shared') sClass = 'sharing-shared';
        else if (sText === 'global') sClass = 'sharing-global';
        
        sharingHtml = `<span class="sharing-badge ${sClass}">${item.SharingStatus}</span>`;
    }

    return `
        <tr class="${rowClass}">
            <td>
                ${item.SKU} 
                <span class="type-badge">${item.Type}</span>
            </td>
            <td>${item.Name || 'N/A'}${sharingHtml}</td>
            ${priceHtml}
            ${afterTaxCell}
        </tr>
    `;
}
