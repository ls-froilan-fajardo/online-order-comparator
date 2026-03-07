// --- DOM Elements ---
const inputAll = document.getElementById('csv-all');
const inputPrices = document.getElementById('csv-prices');
const btnReset = document.getElementById('btn-reset'); 
const btnHelp = document.getElementById('help-btn'); 
const actionBar = document.getElementById('action-bar');
const typeFilter = document.getElementById('type-filter');
const profileFilter = document.getElementById('profile-filter');
const taxType = document.getElementById('tax-type'); 
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
let groupTaxMapping = new Map(); // Maps AccountingGroup -> Tax Level (1, 2, 3, 4, or 0 for exempt)

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
            <li style="margin-bottom: 10px;"><strong>Map Accounting Groups:</strong> Use the dropdown cards above the left-hand table to assign specific tax rates to specific accounting groups (or mark them Tax-Free).</li>
            <li style="margin-bottom: 10px;"><strong>Analyze Order:</strong> Paste an online order JSON payload into the "JSON Extractor" field.</li>
            <li><strong>Compare:</strong> The tool will pull in the online item prices, apply the exact taxes mapped to each item, and calculate the expected POS Base total!</li>
        </ol>
    `;
    showInfoModal(helpInstructions, "How to Use the Comparator");
});

// --- Helper to get the correct tax % for an item ---
function getTaxConfig(accountingGroup) {
    let taxLevel = 1; // Default to Tax 1 if group isn't mapped
    
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
    return `<span class="tax-badge tb-${taxLevel}">T${taxLevel}</span>`;
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
        let currentProfile = profileFilter.value || 'Default';
        
        if (items.length > 0) {
            
            let tbodyHtml = `<tbody>`;
            
            items.forEach((item, index) => {
                const sku = item.sku || "N/A";
                const qty = item.quantity || 1;
                
                const itemData = itemDB[sku];
                const itemName = itemData ? itemData.Name : (item.customItemName || "Unknown Item");
                const itemAccGroup = itemData ? itemData.AccountingGroup : null;
                const displayAccGroup = itemAccGroup ? itemAccGroup : `<span style="color: #a0aec0; font-style: italic;">None</span>`;
                
                let onlinePriceDisplay = (item.customItemPrice !== null && item.customItemPrice !== undefined) 
                    ? `$${parseFloat(item.customItemPrice).toFixed(2)}` 
                    : "-";
                
                let pInfo = getPriceInfo(sku, currentProfile);
                let rawPrice = (pInfo.raw !== null && !isNaN(pInfo.raw)) ? pInfo.raw : 0;
                
                // MULTI-TAX LOGIC
                let taxCfg = getTaxConfig(itemAccGroup);
                let taxBadge = generateTaxBadge(taxCfg.level);

                let priceWithTax = rawPrice;
                if (currentTaxMode === 'exclusive') {
                    priceWithTax = rawPrice * (1 + (taxCfg.percentage / 100));
                }

                let lineTotal = priceWithTax * qty;
                grandTotal += lineTotal;

                // NEW: Tax column moved between Item Name and Acc. Group
                tbodyHtml += `
                    <tr>
                        <td>${index + 1}</td>
                        <td style="font-weight: bold; color: #4a5568;">${sku}</td>
                        <td style="color: #4a5568;">${itemName}</td>
                        <td>${taxBadge}</td>
                        <td style="color: #4a5568;">${displayAccGroup}</td>
                        <td>${qty}</td>
                        <td style="color: #d69e2e; font-weight: 500;">${onlinePriceDisplay}</td>
                        <td style="font-weight: 500; color: #2b6cb0;">$${lineTotal.toFixed(2)}</td>
                    </tr>
                `;

                if (item.subItems && item.subItems.length > 0) {
                    item.subItems.forEach((subItem) => {
                        const subSku = subItem.sku || "N/A";
                        const subQty = subItem.quantity || 1;
                        
                        const subItemData = itemDB[subSku];
                        const subItemName = subItemData ? subItemData.Name : (subItem.customItemName || "Unknown Item");
                        const subItemAccGroup = subItemData ? subItemData.AccountingGroup : null;
                        const subDisplayAccGroup = subItemAccGroup ? subItemAccGroup : `<span style="color: #a0aec0; font-style: italic;">None</span>`;

                        let subOnlinePriceDisplay = (subItem.customItemPrice !== null && subItem.customItemPrice !== undefined) 
                            ? `$${parseFloat(subItem.customItemPrice).toFixed(2)}` 
                            : "-";

                        let subPInfo = getPriceInfo(subSku, currentProfile);
                        let subRawPrice = (subPInfo.raw !== null && !isNaN(subPInfo.raw)) ? subPInfo.raw : 0;

                        // MULTI-TAX LOGIC (SUB ITEMS)
                        let subTaxCfg = getTaxConfig(subItemAccGroup);
                        let subTaxBadge = generateTaxBadge(subTaxCfg.level);

                        let subPriceWithTax = subRawPrice;
                        if (currentTaxMode === 'exclusive') {
                            subPriceWithTax = subRawPrice * (1 + (subTaxCfg.percentage / 100));
                        }

                        let subLineTotal = subPriceWithTax * subQty;
                        grandTotal += subLineTotal;

                        // NEW: Tax column moved between Item Name and Acc. Group
                        tbodyHtml += `
                            <tr>
                                <td></td>
                                <td style="padding-left: 25px; color: #718096; font-size: 0.75rem;">
                                    <span style="color: #cbd5e0; margin-right: 4px;">↳</span>${subSku}
                                </td>
                                <td style="color: #718096; font-size: 0.75rem;">${subItemName}</td>
                                <td>${subTaxBadge}</td>
                                <td style="color: #718096; font-size: 0.75rem;">${subDisplayAccGroup}</td>
                                <td style="color: #718096; font-size: 0.75rem;">${subQty}</td>
                                <td style="color: #d69e2e; font-size: 0.75rem;">${subOnlinePriceDisplay}</td>
                                <td style="color: #718096; font-size: 0.75rem;">$${subLineTotal.toFixed(2)}</td>
                            </tr>
                        `;
                    });
                }
            });

            tbodyHtml += `</tbody>`;

            // NEW: Header updated to match column order
            let theadHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item SKU</th>
                            <th>Item Name</th>
                            <th>Tax</th>
                            <th>Acc. Group</th>
                            <th>Quantity</th>
                            <th>Online Price</th>
                            <th>Total (w/ Tax)</th>
                        </tr>
                    </thead>
            `;

            jsonDisplay.innerHTML = theadHtml + tbodyHtml + `</table>`;

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
    
    document.getElementById('output-placeholder').style.display = 'block';
    actionBar.style.display = 'none';
    tableContainer.innerHTML = "";
    jsonDisplay.innerHTML = "";
    totalsBadge.style.display = "none"; 
    accountingGroupsContainer.style.display = "none"; 
    accountingGroupsContainer.innerHTML = "";
    taxType.value = "exclusive"; 
    taxInput1.value = "0";
    taxInput2.value = "0";
    taxInput3.value = "0";
    taxInput4.value = "0";
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
                        accountingGroupsContainer.innerHTML = `<div class="ag-header">Tax Mapping:</div>`;
                        
                        uniqueAccountingGroups.forEach(groupName => {
                            groupTaxMapping.set(groupName, 1); // Set default to Tax 1
                            
                            let card = document.createElement('div');
                            card.className = 'ag-card';
                            
                            card.innerHTML = `
                                <span class="ag-card-name" title="${groupName}">${groupName}</span>
                                <select class="ag-card-select">
                                    <option value="1">Tax 1</option>
                                    <option value="2">Tax 2</option>
                                    <option value="3">Tax 3</option>
                                    <option value="4">Tax 4</option>
                                    <option value="0">Tax-Free</option>
                                </select>
                            `;
                            
                            const selectElement = card.querySelector('select');
                            selectElement.addEventListener('change', (e) => {
                                groupTaxMapping.set(groupName, parseInt(e.target.value));
                                renderTable(typeFilter.value, profileFilter.value);
                                renderJSON();
                            });
                            
                            accountingGroupsContainer.appendChild(card);
                        });
                        
                        accountingGroupsContainer.style.display = 'block';
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

                    // --- STORE ACCOUNTING GROUP IN itemDB ---
                    allData.forEach(row => {
                        if (row['Type'] && row['Type'].trim() !== '') {
                            let ag = row['Accounting group'] || row['Accounting Group']; 
                            itemDB[row['SKU']] = { 
                                SKU: row['SKU'], 
                                Name: row['Name'], 
                                Type: row['Type'], 
                                AccountingGroup: ag ? ag.trim() : '',
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
                    actionBar.style.display = 'flex';
                    renderTable(typeFilter.value, profileFilter.value);
                    renderJSON(); 
                }
            });
        }
    });
}

// Global Triggers
typeFilter.addEventListener('change', () => { renderTable(typeFilter.value, profileFilter.value); });
profileFilter.addEventListener('change', () => { renderTable(typeFilter.value, profileFilter.value); renderJSON(); });
taxType.addEventListener('change', () => { if (filesLoaded) { renderTable(typeFilter.value, profileFilter.value); renderJSON(); } });

// Trigger updates when ANY tax input changes
const updateTaxes = () => { if (filesLoaded) { renderTable(typeFilter.value, profileFilter.value); renderJSON(); } };
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
    let html = `
        <table>
            <thead>
                <tr>
                    <th>SKU & Hierarchy</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th style="color: #d69e2e;">Price (w/ Tax)</th>
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

    let afterTaxText = ""; 
    let currentTaxMode = taxType.value; 

    if (rawCalcPrice !== null && !isNaN(rawCalcPrice)) {
        // MULTI-TAX LOGIC FOR LEFT TABLE
        let taxCfg = getTaxConfig(item.AccountingGroup);
        
        let finalPrice = rawCalcPrice; 
        if (currentTaxMode === 'exclusive') {
            finalPrice = rawCalcPrice * (1 + (taxCfg.percentage / 100));
        }
        
        afterTaxText = finalPrice.toFixed(2);
    }

    let priceHtml = `<td>${priceText}</td>`;
    
    if (isInherited) {
        priceHtml = `<td><span title="Price overridden by parent Group" style="color: #2b6cb0; font-weight: 600;">${priceText} <span style="font-size:0.65rem; background:#ebf8ff; padding:2px 4px; border-radius:4px;">Group</span></span></td>`;
    } else if (isFallback) {
        priceHtml = `<td><span title="No profile price found. Falling back to default." style="color: #a0aec0; font-style: italic;">${priceText}*</span></td>`;
    }

    return `
        <tr class="${rowClass}">
            <td>
                ${item.SKU} 
                <span class="type-badge">${item.Type}</span>
            </td>
            <td>${item.Name || 'N/A'}</td>
            ${priceHtml}
            <td style="font-weight: 500;">${afterTaxText}</td>
        </tr>
    `;
}
