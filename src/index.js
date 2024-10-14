const CMD_SINGLE_SETTING = 0xA8;
const CMD_SINGLE_VALUE = 0xA3;
const CMD_STATUS = 0xA4;

let device, server, txCharacteristic, rxCharacteristic;
let settingsData = null;
let readPromiseResolve = null;
let readPromiseReject = null;
let bleReadableValues = new Map();

// Toggle log visibility
document.getElementById('toggle-log').addEventListener('click', function () {
    const logElement = document.getElementById('log');
    if (logElement.style.display !== 'block') {
        logElement.style.display = 'block';
        this.textContent = 'Hide Log';
    } else {
        logElement.style.display = 'none';
        this.textContent = 'Show Log';
    }
});

document.getElementById('load-settings-button').addEventListener('click', function () {
    const selectedFile = document.getElementById('settings-dropdown').value;
    log(`Loading settings from ${selectedFile}...`);
    loadSettings(selectedFile); // Load the selected JSON file
});

async function loadAvailableSettings() {
    try {
        // Static list of settings files
        const files = [
            "settings-v6.8.1.json",
            "settings-v4.4.2.json"
        ];
        const dropdown = document.getElementById('settings-dropdown');
        dropdown.innerHTML = ''; // Clear previous options

        files.forEach(file => {
            const option = document.createElement('option');
            option.value = `./settings/${file}`;
            option.textContent = file;
            dropdown.appendChild(option);
        });

        document.getElementById('settings-selection').style.display = 'block'; // Show the dropdown and load button
    } catch (error) {
        log(`Error fetching settings files: ${error.message}`, true);
    }
}

function toHex(byte) {
    return `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesToHex(bytes) {
    return `{${Array.from(bytes).map(toHex).join(', ')}}`;
}

function stringToUint8Array(hexString) {
    // Check if the input is null, undefined, or not a string
    if (!hexString || typeof hexString !== 'string') {
        return new Uint8Array();
    }

    return new Uint8Array(hexString
        .replace(/{|}/g, '')  // remove curly braces
        .split(',')           // split by commas
        .map(part => parseInt(part.trim().replace(/0x/i, ''))) // remove "0x" prefix and trim spaces, convert to int
        .map(hex => parseInt(hex, 16))); // convert hex to integer
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getBleReadableValue(id) {
    if (typeof id === 'string' || id instanceof String) {
        id = parseInt(id, 16);
    }

    if (!bleReadableValues.has(id)) {
        throw new Error(`Value with ID ${toHex(id)} not found`);
    }

    return bleReadableValues.get(id);
}

function registerBleReadableValues(data) {
    // Store settings with 'id' as key in the map
    for (const [key, value] of Object.entries(data)) {
        bleReadableValues.set(parseInt(value.id, 16), [key, value]);
    }
}

function decodeHwFwType(t) {
    switch (t) {
        case 0: return "default";
        case 1: return "rhinoedge";
        case 2: return "elephantedge";
        case 3: return "wisentedge";
        case 4: return "cattracker";
        case 5: return "rangeredge";
        case 6: return "rhinopuck";
        default: return "unknown";
    }
}

function decodeReset(reset) {
    switch (reset) {
        case 1: return "RESETPIN";
        case 2: return "DOG";
        case 4: return "SREQ";
        case 8: return "LOCKUP";
        default: return "unknown";
    }
}


function decodeStatusMessage(bytes) {
    function decode_uint8(byte, min, max) {
        var val;
        val = byte * (max - min) / 255 + min;
        return val;
    }
    // Skip header 0 and 1
    var reset = bytes[2];
    var err = bytes[3];
    var bat = (bytes[4] * 10) + 2500;
    var operation = bytes[5];
    
    var msg = (operation & 1) ? 1 : 0;
    var locked = (operation & 2) ? 1 : 0;
    var lr_join = (operation & 4) ? 1 : 0;

    var lr_sat = operation >> 4;
    var temp = decode_uint8(bytes[6], -100, 100);
    var uptime = bytes[7];
    var acc_x = decode_uint8(bytes[8], -100, 100);
    var acc_y = decode_uint8(bytes[9], -100, 100);
    var acc_z = decode_uint8(bytes[10], -100, 100);
    
    let version = bytes[11];
    var ver_hw_minor = version & 0x0F;
    var ver_hw_major = version >> 4;
    version = bytes[12];
    
    var ver_fw_minor = version & 0x0F;
    var ver_fw_major = version >> 4;
    var ver_hw_type = bytes[13] & 0x0F;
    var ver_fw_type = bytes[13] >> 4;
    var chg = (bytes[14] > 0) ? ((bytes[14] * 100) + 5000) : 0;
    
    var features = bytes[15];
    var sat_support = (features & 1) ? 1 : 0;
    var rf_scan = (features & 2) ? 1 : 0;
    var fence = (features & 4) ? 1 : 0;
    var sat_try = features >> 4;
    
    //Errors
    var err_lr = (err & 1) ? 1 : 0;
    var err_ble = (err & 2) ? 1 : 0;
    var err_ublox = (err & 4) ? 1 : 0;
    var err_acc = (err & 8) ? 1 : 0;
    var err_bat = (err & 16) ? 1 : 0;
    var err_ublox_fix = (err & 32) ? 1 : 0;
    var err_flash = (err & 64) ? 1 : 0;
    return {
        reset: reset,
        bat: bat,
        chg: chg,
        temp: temp,
        uptime: uptime,
        locked: locked,
        msg: msg,
        acc_x: acc_x,
        acc_y: acc_y,
        acc_z: acc_z,
        lr_sat: lr_sat,
        err_lr: err_lr,
        err_lr_join: lr_join,
        err_ble: err_ble,
        err_ublox: err_ublox,
        err_acc: err_acc,
        err_bat: err_bat,
        err_ublox_fix: err_ublox_fix,
        err_flash: err_flash,
        ver_fw_major: ver_fw_major,
        ver_fw_minor: ver_fw_minor,
        ver_hw_major: ver_hw_major,
        ver_hw_minor: ver_hw_minor,
        ver_hw_type: ver_hw_type,
        ver_fw_type: ver_fw_type,
        sat_support: sat_support,
        sat_try: sat_try,
        rf_scan: rf_scan,
        fence: fence,
    };
}

async function displayStatusMessage() {
    const statusMessage = await requestStatusMessage();

    const errorsDiv = document.querySelector('#errors');
    errorsDiv.innerHTML = '';

    // Display error key only if true
    let hasErrors = false;
    for (const [key, hasError] of Object.entries(statusMessage)) {
        if (key.startsWith('err_') && hasError) {
            if (!hasErrors) {
                errorsDiv.innerHTML = 'Errors: ';
                hasErrors = true;
            }

            errorsDiv.innerHTML += `<span>${key.slice(4).toUpperCase()}</span>,`;
        }
    }

    if (hasErrors) {
        errorsDiv.innerHTML = errorsDiv.innerHTML.slice(0, -1); // Remove trailing comma
    } else {
        errorsDiv.innerHTML = 'No errors';
    }

    // Display decoded values in table
    const infoContainer = document.querySelector('#container');
    infoContainer.innerHTML = ''; // clear previous content

    infoContainer.innerHTML += `
        <div class="section">
          <h4>Device Info</h4>
          <div class="data-item"><span>Device name:</span><span>${device.name}</span></div>
          <div class="data-item"><span>Hardware Version:</span><span>${statusMessage.ver_hw_major}.${statusMessage.ver_hw_minor}</span></div>
          <div class="data-item"><span>Firmware Version:</span><span>${statusMessage.ver_fw_major}.${statusMessage.ver_fw_minor}</span></div>
          <div class="data-item"><span>Hardware Type:</span><span>${decodeHwFwType(statusMessage.ver_hw_type)}</span></div>
          <div class="data-item"><span>Firmware Type:</span><span>${decodeHwFwType(statusMessage.ver_fw_type)}</span></div>
          <div class="data-item"><span>LR Sat:</span><span>${statusMessage.lr_sat}</span></div>
          <div class="data-item"><span>Msg:</span><span>${statusMessage.msg}</span></div>
        </div>
      `;

    infoContainer.innerHTML += `
        <div class="section">
          <h4>General Information</h4>
          <div class="data-item"><span>Reset:</span><span>${decodeReset(statusMessage.reset)}</span></div>
          <div class="data-item"><span>Battery:</span><span>${statusMessage.bat}mV</span></div>
          <div class="data-item"><span>Charging:</span><span>${statusMessage.chg}</span></div>
          <div class="data-item"><span>Locked:</span><span>${statusMessage.locked}</span></div>
          <div class="data-item"><span>Temperature:</span><span>${statusMessage.temp.toFixed(2)}°C</span></div>
          <div class="data-item"><span>Uptime:</span><span>${statusMessage.uptime} days</span></div>
          <div class="data-item"><span>Acceleration:</span><span>${statusMessage.acc_x.toFixed(2)}, ${statusMessage.acc_y.toFixed(2)}, ${statusMessage.acc_z.toFixed(2)}</span></div>
        </div>
      `;
}

async function loadSettings(selectedFile) {
    try {
        const response = await fetch(selectedFile); // Load the selected JSON file
        settingsData = await response.json();
        bleReadableValues = new Map();

        registerBleReadableValues(settingsData.settings);
        registerBleReadableValues(settingsData.values);

        log(`Settings from ${selectedFile} loaded successfully.`);

        displaySettings();

        await fetchAllSettings();
    } catch (error) {
        console.error(error);
        log(`Error loading settings: ${error.message}`, true);
    }
}

// Function to group settings by the prefix, move single-item groups to "other", and sort
function groupAndSortSettings(settings) {
    const grouped = {};
    const other = {};

    // Group settings by prefix
    for (const key in settings) {
        const prefix = key.split('_')[0];

        if (!grouped[prefix]) {
            grouped[prefix] = {};
        }

        grouped[prefix][key] = settings[key];
    }

    // Move single-item groups to "other"
    for (const prefix in grouped) {
        if (Object.keys(grouped[prefix]).length === 1) {
            const [key] = Object.keys(grouped[prefix]);
            other[key] = grouped[prefix][key];
            delete grouped[prefix];
        }
    }

    // Add the "other" group if needed
    if (Object.keys(other).length > 0) {
        grouped["_other"] = other;
    }

    // Sort the groups alphabetically
    const sortedGroups = Object.keys(grouped).sort().reduce((acc, group) => {
        // Sort the keys within each group alphabetically
        acc[group] = Object.keys(grouped[group]).sort().reduce((groupAcc, key) => {
            groupAcc[key] = grouped[group][key];
            return groupAcc;
        }, {});
        return acc;
    }, {});

    return sortedGroups;
}

function displaySettings() {
    const settingsSection = document.getElementById('settings-section');
    settingsSection.innerHTML = '';
    for (const [groupName, group] of Object.entries(groupAndSortSettings(settingsData.settings))) {
        const settingsContainer = document.createElement('div');
        settingsContainer.className = 'settings-container';

        const groupHeading = document.createElement('h3');
        groupHeading.textContent = groupName.replace(/_/g, "");
        settingsSection.appendChild(groupHeading);

        for (const [key, setting] of Object.entries(group)) {
            const row = document.createElement('div');
            row.className = 'setting';
            row.setAttribute('id', `setting-${setting.id}`);
            html = `
          <h4>${key} (${setting.id})</h4>
        `;

            if (setting.conversion === 'bool') {
                html += `
              <select id="new-value-${setting.id}" disabled>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
          `;
            } else if (setting.conversion === 'uint32' || setting.conversion === 'uint16' || setting.conversion === 'uint8' || setting.conversion === 'int32' || setting.conversion === 'int8') {
                html += `<input type="number" id="new-value-${setting.id}" min="${setting.min}" max="${setting.max}" disabled/>`;
            } else if (setting.conversion === 'float') {
                html += `<input type="number" id="new-value-${setting.id}" min="${setting.min}" max="${setting.max}" step="0.01" disabled/>`;
            } else if (setting.conversion === 'byte_array') {
                html += `<textarea id="new-value-${setting.id}" rows="4" disabled/></textarea>`;
            } else {
                html += `<input type="text" id="new-value-${setting.id}" disabled/>`;
            }

            html += `
          <div>
            <button id="update-button-${setting.id}" onclick="updateSetting('${setting.id}')" disabled>Update</button>
            <button id="reset-button-${setting.id}" onclick="resetSetting('${setting.id}')" class="secondary" title="Default value: ${setting.default}" disabled>Set default</button>
          </div>
        `;
            row.innerHTML = html;
            settingsContainer.appendChild(row);
        }
        settingsSection.appendChild(settingsContainer);
    }
}

function log(message, isError = false) {
    const logElement = document.getElementById('log');
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry');
    logEntry.style.color = isError ? 'red' : 'black';
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logElement.appendChild(logEntry);
    logElement.scrollTop = logElement.scrollHeight;
}

document.getElementById('connect-button').addEventListener('click', async function () {
    try {
        device = await navigator.bluetooth.requestDevice({
            filters: [{ manufacturerData: [{ companyIdentifier: 0x0A61 }] }],
            optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
        });

        server = await device.gatt.connect();
        const service = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
        txCharacteristic = await service.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
        rxCharacteristic = await service.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');

        await txCharacteristic.startNotifications();
        txCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

        document.getElementById('disconnect-button').disabled = false;

        log(`Connected to device: ${device.name}`);

        // Load available settings files (instead of loading automatically)
        await loadAvailableSettings();
        await displayStatusMessage();
    } catch (error) {
        log(`Error: ${error.message}`, true);
    }
});

document.getElementById('disconnect-button').addEventListener('click', function () {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
        document.getElementById('errors').textContent = '';
        document.getElementById('container').textContent = '';
        document.getElementById('disconnect-button').disabled = true;
        document.getElementById('settings-selection').style.display = 'none'; // Hide settings dropdown and button
        log('Disconnected from device');
        document.getElementById('settings-section').innerHTML = '';
        document.getElementById('log').innerHTML = '';
    }
});

async function handleNotifications(event) {
    if (!readPromiseResolve || !readPromiseReject) {
        log('Promise not found', true);
    }

    const value = event.target.value;
    const data = new Uint8Array(value.buffer);

    log(`Raw data received: ${bytesToHex(data)}`);

    const port = data[0];
    try {
        if (port === 3 || port === 30) {
            readPromiseResolve(decodeBleValueResponse(data));
        } else if (port === 4) {
            readPromiseResolve(decodeStatusMessage(data.slice(1)));
        } else {
            throw new Error('No decoder available for port: ' + port);
        }
    } catch (error) {
        log(`Error decoding response: ${error.message}`, true);
        readPromiseReject(error);
    }
}

function decodeBleValueResponse(data) {
    const valueId = data[1];
    const length = data[2];
    const valueBytes = data.slice(3, 3 + length);

    const [key, valueMeta] = getBleReadableValue(valueId);

    let value;

    // Handling different data types
    switch(valueMeta.conversion) {
        case 'uint32' : 
        value = new DataView(new Uint8Array(valueBytes).buffer).getUint32(0, true);
        break;
    case 'uint16' :
        value = new DataView(new Uint8Array(valueBytes).buffer).getUint16(0, true);
        break;
    case 'uint8' :
        value = valueBytes[0];
        break;
    case 'int32' :
        value = new DataView(new Uint8Array(valueBytes).buffer).getInt32(0, true);
        break;
    case 'int8' :
        value = new DataView(new Uint8Array(valueBytes).buffer).getInt8(0);
        break;
    case 'bool' :
        value = valueBytes[0] !== 0;
        break;
    case 'float' :
        value = new DataView(new Uint8Array(valueBytes).buffer).getFloat32(0, true);
        break;
    case 'byte_array' :
        value = bytesToHex(valueBytes);
        break;
    case 'string' :
        value = new TextDecoder().decode(new Uint8Array(valueBytes));
        break;
    default:
        log(`Unknown conversion type for ${key}: ${valueMeta.conversion}`, true);
        return "???";
    }

    log(`Decoded setting response: ${key} = ${value}`);
    return value;
}

function arraysEqual(arr1, arr2) {
    // Check if lengths are different
    if (arr1.length !== arr2.length) {
        return false;
    }

    // Check if all elements are equal
    return arr1.every((element, index) => element === arr2[index]);
}

function isValueNotDefault(settingId, value) {
    const [key, valueMeta] = getBleReadableValue(settingId);
    if (valueMeta.conversion === 'byte_array') {
        return !arraysEqual(stringToUint8Array(value), stringToUint8Array(valueMeta.default));
    }
    return value !== valueMeta.default;
}

function updateSettingDisplay(settingId, value, isUpdated = false) {
    const [key, valueMeta] = getBleReadableValue(settingId);

    const inputElement = document.getElementById(`new-value-${settingId}`);
    const updateButton = document.getElementById(`update-button-${settingId}`);
    const resetButton = document.getElementById(`reset-button-${settingId}`);

    inputElement.value = value;
    inputElement.disabled = false;
    updateButton.disabled = false;
    resetButton.disabled = false;

    const rowElement = document.getElementById(`setting-${settingId}`);
    if (rowElement) {
        if (isUpdated) {
            rowElement.classList.add('value-updated');
        } else {
            rowElement.classList.remove('value-updated');
        }

        if (isValueNotDefault(settingId, value)) {
            rowElement.classList.add('value-not-default');
        } else {
            rowElement.classList.remove('value-not-default');
        }
    }
}

async function requestBleValue(id, cmd) {
    if (typeof id === 'string' || id instanceof String) {
        id = parseInt(id, 16);
    }

    return executeBleCommand([0x20, cmd, 0x01, id]);
}

async function requestStatusMessage() {
    return executeBleCommand([0x20, CMD_STATUS, 0x00])
}

async function executeBleCommand(command) {
    if (readPromiseResolve && readPromiseReject) {
        log('Previous request still pending', true);
        return;
    }

    log(`Sending command ${bytesToHex(command)}`);

    const commandBuffer = new Uint8Array(command).buffer;
    try {
        readPromise = new Promise((resolve, reject) => {
            readPromiseResolve = resolve;
            readPromiseReject = reject;

            setTimeout(() => {
                reject(new Error('Timeout'));
            }, 5000);
        });

        await rxCharacteristic.writeValue(commandBuffer);

        let value = await readPromise;
        return value;
    } catch (error) {
        log(`Error sending command: ${error.message}`, true);
    } finally {
        readPromiseReject = null;
        readPromiseResolve = null;
    }
}

async function fetchAllSettings() {
    const progressContainer = document.getElementById('settings-progress')
    progressContainer.style.display = 'block';
    const progressBar = document.querySelector('#settings-progress div');
    const statusTableBody = document.querySelector('#status-table tbody');
    const entries = Object.entries(settingsData.settings);
    let index = 0;
    for (const [key, setting] of entries) {
        progressBar.style.width = `${(index / entries.length) * 100}%`;
        updateSettingDisplay(setting.id, await requestBleValue(setting.id, CMD_SINGLE_SETTING));
        index++;
    }
    progressContainer.style.display = 'none';
}

async function resetSetting(settingId) {
    const inputElement = document.getElementById(`new-value-${settingId}`);
    const [settingKey, setting] = getBleReadableValue(settingId);
    inputElement.value = setting.default;
}

async function updateSetting(settingId) {
    const inputElement = document.getElementById(`new-value-${settingId}`);
    const updateButton = document.getElementById(`update-button-${settingId}`);
    const resetButton = document.getElementById(`reset-button-${settingId}`);

    const newValue = inputElement.value.trim();

    if (!newValue) {
        log(`No new value provided for setting ID: ${settingId}`, true);
        return;
    }

    const [settingKey, setting] = getBleReadableValue(settingId);

    // Validate input
    if (!validateInput(newValue, setting)) return;

    let valueBytes;

    if (setting.conversion === 'uint32') {
        const intValue = parseInt(newValue, 10);
        valueBytes = new Uint8Array(new Uint32Array([intValue]).buffer);
    } else if (setting.conversion === 'uint16') {
        const intValue = parseInt(newValue, 10);
        valueBytes = new Uint8Array(new Uint16Array([intValue]).buffer);
    } else if (setting.conversion === 'uint8') {
        valueBytes = new Uint8Array([parseInt(newValue, 10)]);
    } else if (setting.conversion === 'int32') {
        const intValue = parseInt(newValue, 10);
        valueBytes = new Uint8Array(new Int32Array([intValue]).buffer);
    } else if (setting.conversion === 'int8') {
        valueBytes = new Uint8Array([parseInt(newValue, 10)]);
    } else if (setting.conversion === 'float') {
        valueBytes = new Uint8Array(new Float32Array([parseFloat(newValue)]).buffer);
    } else if (setting.conversion === 'bool') {
        valueBytes = new Uint8Array([newValue.toLowerCase() === 'true' ? 1 : 0]);
    } else if (setting.conversion === 'byte_array') {
        valueBytes = stringToUint8Array(newValue);
    } else if (setting.conversion === 'string') {
        valueBytes = new TextEncoder().encode(newValue);
    } else {
        log(`Unknown conversion type for ${settingKey}: ${setting.conversion}`, true);
        return;
    }

    const length = valueBytes.length;
    const command = [0x03, parseInt(settingId, 16), length, ...valueBytes];
    const commandBuffer = new Uint8Array(command).buffer;


    log(`Sending update for ${settingKey} (ID: ${settingId}) with value: ${newValue}`);

    try {
        updateButton.disabled = true;
        inputElement.disabled = true;
        resetButton.disabled = true;
        await rxCharacteristic.writeValue(commandBuffer);
        log(`Value updated successfully for ${settingKey} (ID: ${settingId})`);
        await sleep(1000);
        updateSettingDisplay(settingId, await requestBleValue(settingId, CMD_SINGLE_SETTING), true);
    } catch (error) {
        log(`Error sending update for ${settingKey}: ${error.message}`, true);
    } finally {
        updateButton.disabled = false;
        inputElement.disabled = false;
        resetButton.disabled = false;
    }
}

function validateInput(newValue, setting) {
    const inputElement = document.getElementById(`new-value-${setting.id}`);

    if (setting.conversion === 'uint32' || setting.conversion === 'uint16' || setting.conversion === 'uint8' || setting.conversion === 'int32') {
        const parsedValue = parseInt(newValue, 10);
        if (isNaN(parsedValue) || parsedValue < setting.min || parsedValue > setting.max) {
            log(`Invalid value for ${setting.id}: Must be between ${setting.min} and ${setting.max}`, true);
            inputElement.classList.add('invalid');
            return false;
        }
    } else if (setting.conversion === 'bool') {
        if (newValue.toLowerCase() !== 'true' && newValue.toLowerCase() !== 'false') {
            log(`Invalid value for ${setting.id}: Must be 'true' or 'false'`, true);
            inputElement.classList.add('invalid');
            return false;
        }
    } else if (setting.conversion === 'byte_array') {
        const byteArray = newValue.replace(/[{}]/g, '').split(',');
        if (byteArray.length !== setting.length || byteArray.some(byte => isNaN(parseInt(byte, 16)))) {
            log(`Invalid byte array for ${setting.id}. Expected length: ${setting.length}`, true);
            inputElement.classList.add('invalid');
            return false;
        }
    }

    inputElement.classList.remove('invalid');
    return true;
}