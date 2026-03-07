// --- DOM Elements ---
const inputAll = document.getElementById('csv-all');
const inputPrices = document.getElementById('csv-prices');
const btnReset = document.getElementById('btn-reset'); 
const btnHelp = document.getElementById('help-btn'); 
const actionBar = document.getElementById('action-bar');
const typeFilter = document.getElementById('type-filter');
const profileFilter = document.getElementById('profile-filter');
const taxType = document.getElementById('tax-type'); 
const taxInput = document.getElementById('tax-input');
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
let activeAccountingGroups = new Set(); 

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
            <li style="margin-bottom: 10px;"><strong>Upload CSV Files:</strong> Upload your <em>Lightspeed formatted file</em> (which holds SKUs and Accounting Groups) and your <em>Prices only</em> CSV.</li>
            <li style="margin-bottom: 10px;"><strong>Configure Settings:</strong> Select an Account Profile (e.g., DoorDash, UberEats), input your Tax %, and choose Tax Exclusive or Inclusive.</li>
            <li style="margin-bottom: 10px;"><strong>Toggle Taxes:</strong> Click the "Taxable Groups" badges above the right-hand table to easily include or exclude tax for specific accounting groups.</li>
            <li style="margin-bottom: 10px;"><strong>Analyze Order:</strong> Paste an online order JSON payload into the "JSON Extractor" field.</li>
            <li><strong>Compare:</strong> The tool will pull in the online item prices and instantly calculate the expected POS Base total for comparison!</li>
        </ol>
    `;
    showInfoModal(helpInstructions, "How to Use the Comparator");
});

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
        let globalTaxPercentage = parseFloat(taxInput.value) || 0;
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
                
                // Info Icon for Main Item
                const groupTooltip = itemAccGroup ? `<strong>Accounting Group:</strong><br>${itemAccGroup}` : "<strong>Accounting Group:</strong><br>Not Assigned";
                const safeGroupTooltip = groupTooltip.replace(/'/g, "\\'"); 
                const infoIcon = `<span onclick="showInfoModal('${safeGroupTooltip}')" style="cursor: pointer; color: #a0aec0; margin-left: 6px; font-size: 1.1em; vertical-align: middle;">&#9432;</span>`;
                
                let onlinePriceDisplay = (item.customItemPrice !== null && item.customItemPrice !== undefined) 
                    ? `$${parseFloat(item.customItemPrice).toFixed(2)}` 
                    : "-";
                
                let pInfo = getPriceInfo(sku, currentProfile);
                let rawPrice = (pInfo.raw !== null && !isNaN(pInfo.raw)) ? pInfo.raw : 0;
                
                // --- TAX EXCLUSION LOGIC ---
                let appliedTaxPercentage = globalTaxPercentage;
                let isTaxable = true;

                if (itemAccGroup && !activeAccountingGroups.has(itemAccGroup)) {
                    appliedTaxPercentage = 0; // Tax Free if group is unselected
                    isTaxable = false;
                }

                // NEW: Tax Status Badge
                const taxBadge = isTaxable 
                    ? `<span style="font-size: 0.6rem; background: #e6fffa; color: #234e52; padding: 2px 5px; border-radius: 4px; margin-left: 8px; border: 1px solid #319795; vertical-align: middle;">Taxable</span>`
                    : `<span style="font-size: 0.6rem; background: #fff5f5; color: #9b2c2c; padding: 2px 5px; border-radius: 4px; margin-left: 8px; border: 1px solid #e53e3e; vertical-align: middle;">Tax-Free</span>`;

                let priceWithTax = rawPrice;
                if (currentTaxMode === 'exclusive') {
                    priceWithTax = rawPrice * (1 + (appliedTaxPercentage / 100));
                }

                let lineTotal = priceWithTax * qty;
                grandTotal += lineTotal;

                tbodyHtml += `
                    <tr>
                        <td>${index + 1}</td>
                        <td style="font-weight: bold; color: #4a5568;">${sku}</td>
                        <td style="color: #4a5568; display: flex; align-items: center; border-bottom: none;">${itemName}${taxBadge}${infoIcon}</td>
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

                        // Info Icon for Sub Item
                        const subGroupTooltip = subItemAccGroup ? `<strong>Accounting Group:</strong><br>${subItemAccGroup}` : "<strong>Accounting Group:</strong><br>Not Assigned";
                        const safeSubGroupTooltip = subGroupTooltip.replace(/'/g, "\\'");
                        const subInfoIcon = `<span onclick="showInfoModal('${safeSubGroupTooltip}')" style="cursor: pointer; color: #cbd5e0; margin-left: 6px; font-size: 1.1em; vertical-align: middle;">&#9432;</span>`;

                        let subOnlinePriceDisplay = (subItem.customItemPrice !== null && subItem.customItemPrice !== undefined) 
                            ? `$${parseFloat(subItem.customItemPrice).toFixed(2)}` 
                            : "-";

                        let subPInfo = getPriceInfo(subSku, currentProfile);
                        let subRawPrice = (subPInfo.raw !== null && !isNaN(subPInfo.raw)) ? subPInfo.raw : 0;

                        // --- TAX EXCLUSION LOGIC (SUB ITEMS) ---
                        let subAppliedTaxPercentage = globalTaxPercentage;
                        let isSubTaxable = true;

                        if (subItemAccGroup && !activeAccountingGroups.has(subItemAccGroup)) {
                            subAppliedTaxPercentage = 0; 
                            isSubTaxable = false;
                        }

                        // NEW: Tax Status Badge for Sub Item
                        const subTaxBadge = isSubTaxable 
                            ? `<span style="font-size: 0.6rem; background: #e6fffa; color: #234e52; padding: 2px 5px; border-radius: 4px; margin-left: 8px; border: 1px solid #319795; vertical-align: middle;">Taxable</span>`
                            : `<span style="font-size: 0.6rem; background: #fff5f5; color: #9b2c2c; padding: 2px 5px; border-radius: 4px; margin-left: 8px; border: 1px solid #e53e3e; vertical-align: middle;">Tax-Free</span>`;

                        let subPriceWithTax = subRawPrice;
                        if (currentTaxMode === 'exclusive') {
                            subPriceWithTax = subRawPrice * (1 + (subAppliedTaxPercentage / 100));
                        }

                        let subLineTotal = subPriceWithTax * subQty;
                        grandTotal += subLineTotal;

                        tbodyHtml += `
                            <tr>
                                <td></td>
                                <td style="padding-left: 25px; color: #718096; font-size: 0.75rem;">
                                    <span style="color: #cbd5e0; margin-right: 4px;">↳</span>${subSku}
                                </td>
                                <td style="color: #718096; font-size: 0.75rem; display: flex; align-items: center; border-bottom: none;">${subItemName}${subTaxBadge}${subInfoIcon}</td>
                                <td style="color: #718096; font-size: 0.75rem;">${subQty}</td>
                                <td style="color: #d69e2e; font-size: 0.75rem;">${subOnlinePriceDisplay}</td>
                                <td style="color: #718096; font-size: 0.75rem;">$${subLineTotal.toFixed(2)}</td>
                            </tr>
                        `;
                    });
                }
            });

            tbodyHtml += `</tbody>`;

            let theadHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item SKU</th>
                            <th>Item Name</th>
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
    activeAccountingGroups.clear();
    
    document.getElementById('output-placeholder').style.display = 'block';
    actionBar.style.display = 'none';
    tableContainer.innerHTML = "";
    jsonDisplay.innerHTML = "";
    totalsBadge.style.display = "none"; 
    accountingGroupsContainer.style.display = "none"; 
    accountingGroupsContainer.innerHTML = "";
    taxType.value = "exclusive"; 
    taxInput.value = "0";
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

                    // --- POPULATE ACCOUNTING GROUPS & BADGES ---
                    const uniqueAccountingGroups = [...new Set(allData.map(row => {
                        let grp = row['Accounting group'] || row['Accounting Group'];
                        return grp ? grp.trim() : '';
                    }).filter(Boolean))];
                    
                    activeAccountingGroups.clear(); 

                    if (uniqueAccountingGroups.length > 0) {
                        accountingGroupsContainer.innerHTML = `<strong style="color: #2d3748; font-size: 0.85rem; padding-right: 5px;">Taxable Groups:</strong>`;
                        
                        uniqueAccountingGroups.forEach(groupName => {
                            activeAccountingGroups.add(groupName); 
                            
                            let badge = document.createElement('span');
                            badge.className = 'group-badge active';
                            badge.textContent = groupName;
                            
                            badge.onclick = () => {
                                if (activeAccountingGroups.has(groupName)) {
                                    activeAccountingGroups.delete(groupName);
                                    badge.classList.remove('active');
                                    badge.classList.add('inactive');
                                } else {
                                    activeAccountingGroups.add(groupName);
                                    badge.classList.remove('inactive');
                                    badge.classList.add('active');
                                }
                                renderTable(typeFilter.value, profileFilter.value);
                                renderJSON();
                            };
                            
                            accountingGroupsContainer.appendChild(badge);
                        });
                        
                        accountingGroupsContainer.style.display = 'flex';
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

typeFilter.addEventListener('change', () => { renderTable(typeFilter.value, profileFilter.value); });
profileFilter.addEventListener('change', () => { renderTable(typeFilter.value, profileFilter.value); renderJSON(); });
taxType.addEventListener('change', () => { 
    if (filesLoaded) { renderTable(typeFilter.value, profileFilter.value); renderJSON(); } 
});
taxInput.addEventListener('input', () => {
    if (filesLoaded) { renderTable(typeFilter.value, profileFilter.value); renderJSON(); }
});

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
    let globalTaxPercentage = parseFloat(taxInput.value) || 0;

    if (rawCalcPrice !== null && !isNaN(rawCalcPrice)) {
        
        let appliedTaxPercentage = globalTaxPercentage;
        if (item.AccountingGroup && !activeAccountingGroups.has(item.AccountingGroup)) {
            appliedTaxPercentage = 0; 
        }
        
        let finalPrice = rawCalcPrice; 
        if (currentTaxMode === 'exclusive') {
            finalPrice = rawCalcPrice * (1 + (appliedTaxPercentage / 100));
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
