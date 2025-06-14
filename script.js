// --- Core Application State & Data Storage (using localStorage) ---
let currentUsername = null; // User's chosen display name
let userPoints = 0;
let totalCarbonSaved = 0;
let historyLog = [];
let authMode = 'login'; // 'login' or 'register'

// Map related variables
let map = null; // Leaflet map object
let userLocation = null; // Stores user's current [lat, lng] array
let userMarker = null; // Leaflet marker for user's location
let binMarkers = []; // Array to store Leaflet bin markers

// Teachable Machine Variables
let model, webcam, labelContainer, maxPredictions;
let predictedWasteType = null; // Stores the currently predicted waste type
let predictionConfidence = 0; // Stores the confidence of the prediction

// IMPORTANT: Your Teachable Machine model URL is now set here!
// Replace 'YOUR_MODEL_ID' with your actual Teachable Machine model URL.
// Example: const URL = "https://teachablemachine.withgoogle.com/models/abcdefg/";
const URL = "https://teachablemachine.withgoogle.com/models/JABYkCfQy/";

// Function to explicitly set a test user location for debugging/demonstration
// Uncomment and modify this line with your desired test coordinates
// const TEST_USER_LOCATION = [3.1238793, 101.659759]; // Latitude, Longitude (e.g., within UM)


// Pre-defined bins for demonstration around Universiti Malaya
// These are not per-user, but part of the system's global data
const companyBins = [
    { id: "bin-UM-001", location: "UM Main Campus (Admin Building)", type: "General", fillLevel: 30, status: 'Normal', coordinates: [3.1190, 101.6534], lastUpdated: new Date().toISOString() },
    { id: "bin-UM-002", location: "UM Medical Centre Entrance", type: "Recycling", fillLevel: 85, status: 'Full', coordinates: [3.1137182, 101.6529117], lastUpdated: new Date().toISOString() },
    { id: "bin-UM-003", location: "Faculty of Dentistry", type: "Compost", fillLevel: 60, status: 'Service Required', coordinates: [3.111625, 101.652962], lastUpdated: new Date().toISOString() },
    { id: "bin-UM-004", location: "UM Central Library", type: "General", fillLevel: 70, status: 'Normal', coordinates: [3.118509, 101.652758], lastUpdated: new Date().toISOString() },
    { id: "bin-UM-005", location: "Faculty of Computer Science & IT", type: "Recycling", fillLevel: 20, status: 'Normal', coordinates: [3.1170, 101.6520], lastUpdated: new Date().toISOString() }, // Approximate central point
    { id: "bin-UM-006", location: "Perdanasiswa Complex", type: "General", fillLevel: 95, status: 'Full', coordinates: [3.1197, 101.6526], lastUpdated: new Date().toISOString() }, // Close to reported Perdanasiswa/Library area
    { id: "bin-UM-007", location: "UM Sports Centre", type: "Compost", fillLevel: 45, status: 'Normal', coordinates: [3.1154, 101.6508], lastUpdated: new Date().toISOString() }, // Near sports ground
    { id: "bin-UM-008", location: "Faculty of Engineering", type: "Recycling", fillLevel: 55, status: 'Normal', coordinates: [3.1186, 101.6553], lastUpdated: new Date().toISOString() },
    { id: "bin-UM-009", location: "Faculty of Law", type: "General", fillLevel: 75, status: 'Service Required', coordinates: [3.1204, 101.6552], lastUpdated: new Date().toISOString() } // Based on nearby points to Ambang Asuhan Jepun
];

// Carbon impact values per throw, based on the specific waste type (in kg CO2e)
const CARBON_IMPACT_PER_THROW = {
    "Paper": 0.9,       // Saved for recycling
    "Plastic": 1.1,     // Saved for recycling
    "Glass": 0.8,       // Saved for recycling
    "Aluminium": 1.2,   // Saved for recycling
    "Food Waste": 0.7,  // Saved for composting
    "Non-recyclable": -0.5 // Produced/Not saved for general waste
};

// --- Teachable Machine Class to Specific Waste Category Mapping ---
function mapTmClassToDetectedWasteType(tmClass) {
    tmClass = tmClass.toLowerCase();
    if (tmClass === 'plastic') {
        return 'Plastic';
    } else if (tmClass === 'paper') {
        return 'Paper';
    } else if (tmClass === 'glass') {
        return 'Glass';
    } else if (tmClass === 'metal' || tmClass === 'aluminum' || tmClass === 'aluminium') {
        return 'Aluminium';
    } else if (tmClass === 'organic' || tmClass === 'food waste' || tmClass === 'compost') {
        return 'Food Waste';
    } else { // This covers 'General', 'Other', or any unmapped TM class
        return 'Non-recyclable';
    }
}

// --- Specific Waste Category to Broad Bin Type Mapping ---
function mapDetectedWasteTypeToBinCategory(detectedWasteType) {
    switch (detectedWasteType) {
        case 'Paper':
        case 'Plastic':
        case 'Glass':
        case 'Aluminium':
            return 'Recycling';
        case 'Food Waste':
            return 'Compost';
        case 'Non-recyclable':
            return 'General';
        default:
            return 'General'; // Fallback for any unhandled detected waste types
    }
}


// --- DOM Elements ---
const authSection = document.getElementById('auth-section');
const appSections = document.getElementById('app-sections');
const authForm = document.getElementById('auth-form');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const authConfirmPasswordInput = document.getElementById('auth-confirm-password');
const authFormTitle = document.getElementById('auth-form-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleRegisterBtn = document.getElementById('toggle-register-btn');
const toggleLoginBtn = document.getElementById('toggle-login-btn');

const logoutBtn = document.getElementById('logout-btn');
const authStatusDisplay = document.getElementById('auth-status-display');
const userIdDisplay = document.getElementById('user-id');
const userPointsDisplay = document.getElementById('user-points');
const binsList = document.getElementById('bins-list');
// Removed dashboard elements
const noBinsMessage = document.getElementById('no-bins-message');
const throwWasteBtn = document.getElementById('throw-waste-btn');
const mapElement = document.getElementById('map');
const mapStatusElement = document.getElementById('map-status');
const nearbySuggestionsEl = document.getElementById('nearby-bin-suggestions');
const suggestionListEl = document.getElementById('suggestion-list');
const historyListEl = document.getElementById('history-list');
const noHistoryMessage = document.getElementById('no-history-message');
const carbonSavedEl = document.getElementById('carbon-saved');
const webcamContainer = document.getElementById('webcam-container');
const loadingCameraMessage = document.getElementById('loading-camera-message');
labelContainer = document.getElementById('label-container');

// Points configuration
const POINTS_FOR_THROW_WASTE = 1;

// Rewards data - UPDATED WITH LOGO URLs
const rewards = [
    { id: "touchngo_rm5", name: "Touch 'n Go eWallet Voucher (RM5)", cost: 100, logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Touch_%27n_Go_eWallet_logo.svg/768px-Touch_%27n_Go_eWallet_logo.svg.png?20200518080317" },
    { id: "shopee_rm10", name: "Shopee Voucher (RM10)", cost: 200, logo: "https://1000logos.net/wp-content/uploads/2021/02/Shopee-logo.png" },
    { id: "foodpanda_rm8", name: "Foodpanda Voucher (RM8)", cost: 150, logo: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Foodpanda_logo_since_2017.jpeg" },
    { id: "shell_fuel_rm15", name: "Shell Fuel Voucher (RM15)", cost: 300, logo: "https://images.seeklogo.com/logo-png/18/1/shell-logo-png_seeklogo-184167.png" },
    { id: "tealive_voucher", name: "Tealive Voucher", cost: 75, logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Tealive_logo.svg/1200px-Tealive_logo.svg.png?20240304013514" },
    { id: "mcd_voucher", name: "McDonald's Voucher", cost: 120, logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/McDonald%27s_Golden_Arches.svg/1200px-McDonald%27s_Golden_Arches.svg.png" }
];


// --- Local Storage Data Management ---

/**
 * Retrieves all registered users from localStorage.
 * @returns {Object} An object where keys are usernames and values are user data objects.
 */
function getAllUsersFromLocalStorage() {
    const usersJson = localStorage.getItem('registered_users');
    return usersJson ? JSON.parse(usersJson) : {};
}

/**
 * Saves all registered users to localStorage.
 * @param {Object} users - The object containing all user data.
 */
function saveAllUsersToLocalStorage(users) {
    localStorage.setItem('registered_users', JSON.stringify(users));
}

/**
 * Saves current user data to localStorage.
 */
function saveUserDataToLocalStorage() {
    if (!currentUsername) {
        console.warn("Cannot save user data: No user logged in.");
        return;
    }
    const users = getAllUsersFromLocalStorage();
    users[currentUsername] = {
        username: currentUsername, // Store username for clarity
        password: users[currentUsername] ? users[currentUsername].password : '', // Preserve password if exists
        points: userPoints,
        totalCarbonSaved: totalCarbonSaved,
        historyLog: historyLog
    };
    saveAllUsersToLocalStorage(users);
    console.log(`Data saved for user: ${currentUsername}`);
}

/**
 * Loads user data from localStorage.
 * @param {string} username - The username to load data for.
 * @returns {boolean} True if data loaded successfully, false otherwise.
 */
function loadUserDataFromLocalStorage(username) {
    const users = getAllUsersFromLocalStorage();
    const userData = users[username];
    if (userData) {
        currentUsername = userData.username;
        userPoints = userData.points;
        totalCarbonSaved = userData.totalCarbonSaved;
        historyLog = userData.historyLog;
        console.log(`Data loaded for user: ${currentUsername}`);
        return true;
    }
    return false;
}

// --- Authentication/User Session UI Logic ---

// Toggle between login and register forms
toggleRegisterBtn.addEventListener('click', () => {
    authMode = 'register';
    authFormTitle.textContent = 'Register';
    authSubmitBtn.textContent = 'Register';
    confirmPasswordGroup.classList.remove('hidden');
    toggleRegisterBtn.classList.add('hidden');
    toggleLoginBtn.classList.remove('hidden');
    authUsernameInput.value = '';
    authPasswordInput.value = '';
    authConfirmPasswordInput.value = '';
});

toggleLoginBtn.addEventListener('click', () => {
    authMode = 'login';
    authFormTitle.textContent = 'Login';
    authSubmitBtn.textContent = 'Login';
    confirmPasswordGroup.classList.add('hidden');
    toggleRegisterBtn.classList.remove('hidden');
    toggleLoginBtn.classList.add('hidden');
    authUsernameInput.value = '';
    authPasswordInput.value = '';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;
    const confirmPassword = authConfirmPasswordInput.value;

    if (!username || !password) {
        showCustomModal("Error", "Please fill in all fields.");
        return;
    }

    const users = getAllUsersFromLocalStorage();

    if (authMode === 'register') {
        if (password !== confirmPassword) {
            showCustomModal("Error", "Passwords do not match.");
            return;
        }
        if (password.length < 6) { // Simple password length validation
            showCustomModal("Error", "Password must be at least 6 characters long.");
            return;
        }
        if (users[username]) {
            showCustomModal("Error", "Username already exists. Please choose another or login.");
            return;
        }

        // Register new user
        users[username] = {
            password: password, // IMPORTANT: In a real application, hash this password!
            points: 0,
            totalCarbonSaved: 0,
            historyLog: []
        };
        saveAllUsersToLocalStorage(users);
        currentUsername = username; // Set current user upon successful registration
        userPoints = 0;
        totalCarbonSaved = 0;
        historyLog = [];
        localStorage.setItem('lastLoggedInUser', username); // Remember last logged in user
        showCustomModal("Registration Successful!", `Welcome, ${currentUsername}! You are now logged in.`);
        updateAuthUI(true);
        updateUI(); // Update UI with new user's empty data
        initTeachableMachine();
    } else { // authMode === 'login'
        const storedUser = users[username];
        if (!storedUser || storedUser.password !== password) {
            showCustomModal("Error", "Invalid username or password.");
            return;
        }

        // Login existing user
        currentUsername = username; // Set current user upon successful login
        loadUserDataFromLocalStorage(username); // Load data for this user
        localStorage.setItem('lastLoggedInUser', username); // Remember last logged in user
        showCustomModal("Login Successful!", `Welcome back, ${currentUsername}!`);
        updateAuthUI(true);
        updateUI(); // Update UI with loaded data
        initTeachableMachine();
    }
});

logoutBtn.addEventListener('click', async () => { // Made async to await the modal
    console.log("Logout button clicked. Initiating logout process.");
    // Clear current session data
    currentUsername = null;
    userPoints = 0;
    totalCarbonSaved = 0;
    historyLog = [];
    predictedWasteType = null;
    predictionConfidence = 0;

    // Clear last logged in user from localStorage
    localStorage.removeItem('lastLoggedInUser');

    // Stop webcam and dispose Teachable Machine model
    if (webcam) {
        webcam.stop();
        webcam = null;
    }
    if (model) {
        model.dispose();
        model = null;
    }
    
    // Changed to confirm type to require manual dismissal
    await showCustomModal("Logged Out", "You have been logged out. Click OK to continue.", 'confirm'); 
    
    updateAuthUI(false); // Show login screen
    updateUI(); // Clear UI elements
    labelContainer.innerHTML = 'Point your waste at the camera.'; // Reset label
    loadingCameraMessage.classList.remove('hidden'); // Show loading message again
    throwWasteBtn.disabled = false; // Re-enable if it was disabled by camera error
});

/**
 * Updates the UI based on login status.
 * @param {boolean} isLoggedIn - True if user is logged in, false otherwise.
 */
function updateAuthUI(isLoggedIn) {
    if (isLoggedIn && currentUsername) {
        authSection.style.display = 'none';
        appSections.style.display = 'block';
        authStatusDisplay.textContent = 'Logged In';
        userIdDisplay.textContent = `User: ${currentUsername}`;
        userIdDisplay.classList.remove('hidden');
        userPointsDisplay.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');

        // Invalidate map size when app sections become visible
        if (map) {
            map.invalidateSize();
        }

    } else {
        authSection.style.display = 'flex';
        appSections.style.display = 'none';
        authStatusDisplay.textContent = 'Not Logged In';
        userIdDisplay.classList.add('hidden');
        userPointsDisplay.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        // Clear auth form inputs and reset to login mode
        authUsernameInput.value = '';
        authPasswordInput.value = '';
        authConfirmPasswordInput.value = '';
        authMode = 'login';
        authFormTitle.textContent = 'Login';
        authSubmitBtn.textContent = 'Login';
        confirmPasswordGroup.classList.add('hidden');
        toggleRegisterBtn.classList.remove('hidden');
        toggleLoginBtn.classList.add('hidden');

        labelContainer.innerHTML = 'Point your waste at the camera.'; // Reset label
        loadingCameraMessage.classList.remove('hidden'); // Show loading message again
        throwWasteBtn.disabled = false; // Ensure button is not disabled when logged out
    }
}

// --- Map Initialization Polling ---
let mapInitAttempts = 0;
const maxMapInitAttempts = 50; 
const mapInitInterval = 100;

function checkAndInitializeMap() {
    // If Leaflet (L) is still not defined, it means the script itself isn't loading.
    // The polling is mainly for cases where script might load slightly later.
    // If L is genuinely undefined, it points to network/blocking issues.
    if (typeof L !== 'undefined') {
        console.log("Leaflet (L) is defined. Initializing map features.");
        initializeMap();
        getUserLocation();
        // Check for a previously logged-in user and auto-login if found
        const lastUser = localStorage.getItem('lastLoggedInUser');
        if (lastUser && loadUserDataFromLocalStorage(lastUser)) {
            currentUsername = lastUser; // Ensure currentUsername is set for the loaded user
            updateAuthUI(true);
            updateUI(); // ADDED: Call updateUI here to refresh points and history on auto-login
            initTeachableMachine();
        } else {
            updateAuthUI(false);
        }
        // Ensure rewards are rendered on initial load
        renderRewards(); 
    } else {
        mapInitAttempts++;
        console.log(`Leaflet (L) not defined. Attempt ${mapInitAttempts}. typeof L: ${typeof L}, window.L: ${window.L}`);
        if (mapInitAttempts < maxMapInitAttempts) {
            console.warn(`Leaflet (L) not defined. Retrying map initialization (attempt ${mapInitAttempts}/${maxMapInitAttempts})...`);
            if (mapStatusElement) { // Check if element exists before updating
                mapStatusElement.textContent = "Loading map... (please wait)";
            }
            setTimeout(checkAndInitializeMap, mapInitInterval);
        } else {
            console.error("Leaflet (L) is still not defined after multiple retries. Map features will not work.");
            console.trace("Possible causes: Network issues preventing script load (e.g., unpkg.com being blocked), or strict Content Security Policy. Please check your browser's developer console for network errors (F12 -> Network tab), try refreshing, or check your internet connection.");
            if (mapStatusElement) { // Check if element exists before updating
                mapStatusElement.textContent = "Map failed to load. Please refresh the page or check network connection/browser settings.";
            }
        }
    }
}

// Start the polling when the window loads
window.addEventListener('load', checkAndInitializeMap);


// --- Custom Modal Logic ---
const customModal = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalInput = document.getElementById('modal-input');
const modalOptions = document.getElementById('modal-options');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

let resolveModalPromise;

/**
 * Shows a custom modal for alerts, confirmations, prompts, or options.
 * @param {string} title - The title of the modal.
 * @param {string} message - The message to display.
 * @param {string} type - 'alert', 'confirm', 'prompt', or 'options'.
 * @param {string} inputType - 'text' or 'number' (for prompt).
 * @param {Array<Object>} options - Array of { value, text } for 'options' type.
 * @param {number} [autoCloseDelay=null] - Delay in milliseconds for auto-closing 'alert' type modals. Set to null or 0 to disable.
 * @returns {Promise<any>} A promise that resolves with true/false for confirm, or the input value/selected option value for prompt/options.
 */
function showCustomModal(title, message, type = 'alert', inputType = 'text', options = [], autoCloseDelay = null) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalInput.value = ''; // Clear previous input
    modalOptions.innerHTML = ''; // Clear previous options

    // Reset visibility for all control elements initially
    modalInput.classList.add('hidden');
    modalOptions.classList.add('hidden');
    modalCancelBtn.classList.add('hidden'); // Start hidden for all
    modalConfirmBtn.classList.add('hidden'); // Start hidden for all

    // Configure based on type
    if (type === 'alert') {
        modalConfirmBtn.textContent = 'OK';
        modalConfirmBtn.classList.remove('hidden'); // Show OK for alerts
        if (autoCloseDelay !== null && autoCloseDelay > 0) { // Only auto-close if delay is set and positive
            setTimeout(() => {
                customModal.classList.remove('show');
                if (resolveModalPromise) {
                    resolveModalPromise(true);
                }
            }, autoCloseDelay);
        }
    } else if (type === 'confirm') {
        modalConfirmBtn.textContent = 'Confirm';
        modalConfirmBtn.classList.remove('hidden'); // Show Confirm
        modalCancelBtn.classList.remove('hidden'); // Show Cancel
    } else if (type === 'prompt') {
        modalInput.classList.remove('hidden');
        modalInput.type = inputType;
        modalInput.placeholder = inputType === 'number' ? 'Enter fill level (0-100)' : '';
        modalConfirmBtn.textContent = 'Submit';
        modalConfirmBtn.classList.remove('hidden'); // Show Submit
        modalCancelBtn.classList.remove('hidden'); // Show Cancel
    } else if (type === 'options') {
        modalOptions.classList.remove('hidden');
        options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out';
            button.textContent = option.text;
            button.dataset.value = option.value;
            button.addEventListener('click', () => {
                customModal.classList.remove('show');
                resolveModalPromise(option.value);
            });
            modalOptions.appendChild(button);
        });
        modalCancelBtn.classList.add('hidden'); // Options usually have a cancel button
    }

    customModal.classList.add('show');

    return new Promise(resolve => {
        resolveModalPromise = resolve;
    });
}

modalConfirmBtn.addEventListener('click', () => {
    customModal.classList.remove('show');
    if (modalInput.classList.contains('hidden') && modalOptions.classList.contains('hidden')) {
        if (resolveModalPromise) {
             resolveModalPromise(true);
        }
    } else if (!modalInput.classList.contains('hidden')) {
        resolveModalPromise(modalInput.value);
    }
});

modalCancelBtn.addEventListener('click', () => {
    customModal.classList.remove('show');
    resolveModalPromise(false);
});

// --- UI Rendering and Data Operations ---

/**
 * Updates the entire UI based on current in-memory data.
 */
function updateUI() {
    renderBinCards();
    updatePointsDisplay();
    renderHistory();
    renderCarbonFootprint();
    renderRewards(); // Call renderRewards here
    // Re-render map markers when bins or user location changes
    if (map && typeof L !== 'undefined') { // Check if map object and Leaflet library are available
        renderMapMarkers();
    }
    saveUserDataToLocalStorage(); // Save data after every UI update
}

/**
 * Renders the list of all company bins in the dedicated directory section.
 */
function displayBinDirectory() {
    const binListContainer = document.getElementById('binListContainer');
    const noDirectoryBinsMessage = document.getElementById('no-directory-bins-message');

    if (!binListContainer || !noDirectoryBinsMessage) {
        console.warn('Bin directory container or message element not found. Cannot render directory.');
        return;
    }

    binListContainer.innerHTML = ''; // Clear any existing content

    if (companyBins.length === 0) {
        noDirectoryBinsMessage.classList.remove('hidden');
        binListContainer.appendChild(noDirectoryBinsMessage);
    } else {
        noDirectoryBinsMessage.classList.add('hidden');
        companyBins.forEach(bin => {
            const binCard = document.createElement('div');
            // Using existing 'card' class for styling, plus some additional Tailwind for layout
            binCard.className = 'card bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 ease-in-out flex flex-col';

            let bgColorClass = 'bg-green-500'; // Default for normal
            if (bin.fillLevel > 75) {
                bgColorClass = 'bg-red-500'; // Full
            } else if (bin.fillLevel > 50) {
                bgColorClass = 'bg-yellow-500'; // Service Required
            }

            binCard.innerHTML = `
                <div>
                    <h3 class="text-xl font-semibold mb-2 text-blue-700">${bin.type} Bin</h3>
                    <p class="text-gray-700 mb-1"><strong>ID:</strong> ${bin.id.replace(/-/g, ' ')}</p>
                    <p class="text-gray-700 mb-1"><strong>Location:</strong> ${bin.location}</p>
                    <div class="flex items-center text-gray-700 mb-3">
                        <span class="status-dot ${getStatusColorClass(bin.status)}"></span>
                        <span class="font-medium">Status: ${bin.status}</span>
                    </div>
                    <p class="text-gray-700 mb-2"><strong>Fill Level:</strong> <span class="font-bold">${bin.fillLevel}%</span></p>
                    <div class="progress-bar-container mb-4">
                        <div class="progress-bar ${bgColorClass}" style="width: ${bin.fillLevel}%;"></div>
                    </div>
                    <p class="text-gray-500 text-sm">Last Updated: ${new Date(bin.lastUpdated).toLocaleString()}</p>
                </div>
            `;
            binListContainer.appendChild(binCard);
        });
    }
}

/**
 * Renders all bin cards in the UI.
 */
function renderBinCards() {
    binsList.innerHTML = '';
    if (companyBins.length === 0) { // Using companyBins as the source for display
        noBinsMessage.classList.remove('hidden');
        binsList.appendChild(noBinsMessage);
    } else {
        noBinsMessage.classList.add('hidden');
        companyBins.forEach(bin => { // Iterate over companyBins
            const card = document.createElement('div');
            card.id = `bin-card-${bin.id}`;
            card.className = 'card flex flex-col justify-between';

            let bgColorClass = 'bg-green-500';
            if (bin.fillLevel > 75) {
                bgColorClass = 'bg-red-500';
            } else if (bin.fillLevel > 50) {
                bgColorClass = 'bg-yellow-500';
            }

            card.innerHTML = `
                <div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">${bin.type} Bin - ${bin.id.replace(/-/g, ' ')}</h3>
                    <p class="text-gray-600 mb-2">Location: ${bin.location}</p>
                    <div class="flex items-center text-gray-700 mb-3">
                        <span class="status-dot ${getStatusColorClass(bin.status)}"></span>
                        <span class="status-text font-medium">Status: ${bin.status}</span>
                    </div>
                    <p class="text-gray-700 mb-2 fill-level-text">${bin.fillLevel}% Full</p>
                    <div class="progress-bar-container mb-4">
                        <div class="progress-bar ${bgColorClass}" style="width: ${bin.fillLevel}%;"></div>
                    </div>
                    <p class="text-gray-500 text-sm last-updated">Last Updated: ${new Date(bin.lastUpdated).toLocaleString()}</p>
                </div>
                <div class="flex justify-end space-x-2 mt-4">
                    </div>
            `;
            binsList.appendChild(card);
        });
    }
}

/**
 * Gets the Tailwind background color class for a status dot.
 * @param {string} status - The status of the bin.
 * @returns {string} The CSS class for the status dot color.
 */
function getStatusColorClass(status) {
    switch (status) {
        case 'Normal': return 'bg-green-500';
        case 'Full': return 'bg-red-500';
        case 'Service Required': return 'bg-yellow-500';
        default: return 'bg-gray-400';
    }
}

/**
 * Updates the displayed user points.
 */
function updatePointsDisplay() {
    userPointsDisplay.textContent = `Points: ${userPoints}`;
}

/**
 * Adds an entry to the user's history log.
 * @param {string} action - Description of the action.
 * @param {string} binLocation - Location of the bin involved.
 * @param {string} binType - Type of the bin (General, Recycling, Compost).
 * @param {number} pointsEarned - Points gained or lost for this action.
 * @param {number} carbonImpact - Carbon impact (saved/produced) for this action.
 */
function addHistoryEntry(action, binLocation = '', binType = '', pointsEarned = 0, carbonImpact = 0) {
    historyLog.unshift({
        timestamp: new Date().toISOString(),
        action: action,
        binLocation: binLocation,
        binType: binType,
        points: pointsEarned,
        carbonImpact: carbonImpact
    });
    // Keep history log to a reasonable size, e.g., last 50 entries
    if (historyLog.length > 50) {
        historyLog.pop();
    }
}

/**
 * Renders the user's activity history.
 */
function renderHistory() {
    historyListEl.innerHTML = '';
    if (historyLog.length === 0) {
        noHistoryMessage.classList.remove('hidden');
        historyListEl.appendChild(noHistoryMessage);
    } else {
        noHistoryMessage.classList.add('hidden');
        historyLog.forEach(entry => {
            const historyItem = document.createElement('div');
            historyItem.className = 'border-b border-gray-200 py-2 last:border-b-0';
            let pointsText = '';
            if (entry.points > 0) {
                pointsText = `<span class="text-green-600 font-semibold">(+${entry.points} points)</span>`;
            } else if (entry.points < 0) {
                pointsText = `<span class="text-red-600 font-semibold">(${entry.points} points)</span>`;
            }

            let carbonText = '';
            if (typeof entry.carbonImpact === 'number') {
                if (entry.carbonImpact > 0) {
                    carbonText = `<span class="text-teal-600 font-semibold">(${entry.carbonImpact.toFixed(1)} kg CO2e saved)</span>`;
                } else if (entry.carbonImpact < 0) {
                    carbonText = `<span class="text-orange-600 font-semibold">(${Math.abs(entry.carbonImpact).toFixed(1)} kg CO2e produced)</span>`;
                }
            }

            historyItem.innerHTML = `
                <p class="text-gray-800">${entry.action} into <span class="font-bold">${entry.binType} Bin</span> at ${entry.binLocation} ${pointsText} ${carbonText}</p>
                <p class="text-gray-500 text-sm">${new Date(entry.timestamp).toLocaleString()}</p>
            `;
            historyListEl.appendChild(historyItem);
        });
    }
}

/**
 * Renders the total carbon footprint saved.
 */
function renderCarbonFootprint() {
    const totalCarbonSavedTons = totalCarbonSaved / 1000; // Convert kg to tons
    carbonSavedEl.textContent = `${totalCarbonSavedTons.toFixed(3)} tons`; // Display with 3 decimal places for tons
    // Optionally change color based on positive/negative impact
    if (totalCarbonSaved >= 0) {
        carbonSavedEl.classList.remove('text-red-600');
        carbonSavedEl.classList.add('text-teal-600');
    } else {
        carbonSavedEl.classList.remove('text-teal-600');
        carbonSavedEl.classList.add('text-red-600');
    }
}

/**
 * Simulates throwing waste into a selected bin.
 */
throwWasteBtn.addEventListener('click', async () => {
    if (!currentUsername) {
        await showCustomModal("Login Required", "Please log in to throw waste.");
        return;
    }
    if (companyBins.length === 0) {
        await showCustomModal("No Bins", "There are no bins currently registered in the system to throw waste into.");
        return;
    }

    let detectedWasteType = null; // This will store 'Paper', 'Plastic', 'Non-recyclable', etc.
    let binCategoryToThrow = null; // This will store 'Recycling', 'Compost', 'General'

    // Step 1: Determine the detectedWasteType (from TM or manual)
    if (predictedWasteType && predictionConfidence > 0.7) {
        detectedWasteType = mapTmClassToDetectedWasteType(predictedWasteType);
        await showCustomModal(
            "Detected Waste Type",
            `Detected: ${predictedWasteType} (${(predictionConfidence * 100).toFixed(1)}% confidence). This will be categorized as ${detectedWasteType} waste.`,
            'alert', null, [], 3000
        );
    }

    if (!detectedWasteType) { // If no confident prediction, allow manual selection
        const wasteTypeOptions = [
            { value: "Paper", text: "Paper" },
            { value: "Plastic", text: "Plastic" },
            { value: "Glass", text: "Glass" },
            { value: "Aluminium", text: "Aluminium" },
            { value: "Food Waste", text: "Food Waste" },
            { value: "Non-recyclable", text: "Non-recyclable" }
        ];

        detectedWasteType = await showCustomModal(
            "Select Waste Type",
            "Please select the type of waste you are throwing:",
            'options',
            'text',
            wasteTypeOptions
        );
        if (!detectedWasteType) {
            return; // User cancelled manual selection
        }
    }

    // Step 2: Map the detectedWasteType to the appropriate bin category
    binCategoryToThrow = mapDetectedWasteTypeToBinCategory(detectedWasteType);

    // Step 3: Find an available bin of the correct category
    const availableBins = companyBins.filter(bin => bin.type === binCategoryToThrow && bin.fillLevel < 100);

    if (availableBins.length === 0) {
        await showCustomModal("No Suitable Bins", `No available ${binCategoryToThrow} bins found or all are full.`);
        return;
    }

    availableBins.sort((a, b) => a.fillLevel - b.fillLevel);
    const binToUpdate = availableBins[0]; // Select the least full available bin

    const fillIncrease = Math.floor(Math.random() * 5) + 1;
    binToUpdate.fillLevel = Math.min(100, binToUpdate.fillLevel + fillIncrease);
    binToUpdate.lastUpdated = new Date().toISOString();

    let newStatus = 'Normal';
    if (binToUpdate.fillLevel >= 80) {
        newStatus = 'Full';
    } else if (binToUpdate.fillLevel > 50) {
        newStatus = 'Service Required';
    }
    binToUpdate.status = newStatus;

    userPoints += POINTS_FOR_THROW_WASTE;
    
    // Use the carbon impact value based on the specific detected waste type
    const carbonImpact = CARBON_IMPACT_PER_THROW[detectedWasteType] || 0;
    totalCarbonSaved += carbonImpact;

    addHistoryEntry(
        `Threw ${detectedWasteType} waste`, // History should show granular type
        binToUpdate.location,
        binToUpdate.type, // History should show bin type (e.g., Recycling, Compost, General)
        POINTS_FOR_THROW_WASTE,
        carbonImpact
    );
    
    await showCustomModal(
        "Waste Thrown!", 
        `Thank you! You threw ${detectedWasteType} waste into the bin at ${binToUpdate.location}. It is now ${binToUpdate.fillLevel}% full. +${POINTS_FOR_THROW_WASTE} points earned!`, 
        'confirm',
        null,
        [],
        null
    );
    
    updateUI(); // This will trigger saveUserDataToLocalStorage
});

// --- Rewards Redemption Logic ---

// New function to render rewards (called by updateUI)
function renderRewards() {
    const rewardsListEl = document.getElementById('rewards-list'); // Ensure this ID exists in your index.html
    if (!rewardsListEl) {
        console.error("Element with ID 'rewards-list' not found. Cannot render rewards.");
        return;
    }

    rewardsListEl.innerHTML = ''; // Clear previous rewards
    rewards.forEach(reward => {
        const rewardItem = document.createElement('div');
        rewardItem.className = 'bg-blue-100 p-4 rounded-lg shadow flex flex-col items-center text-center'; 

        rewardItem.innerHTML = `
            <img src="${reward.logo}" alt="${reward.name} Logo" class="w-16 h-16 mb-2 object-contain">
            <h3 class="text-lg font-semibold text-gray-800">${reward.name}</h3>
            <p class="text-gray-600 mb-4">Cost: ${reward.cost} points</p>
            <button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out redeem-btn" 
                    data-reward-id="${reward.id}" data-reward-cost="${reward.cost}">Redeem</button>
        `;
        rewardsListEl.appendChild(rewardItem);
    });

    // Attach event listeners for redeem buttons after rendering
    // IMPORTANT: Remove existing listeners first to prevent duplicates if renderRewards is called multiple times
    document.querySelectorAll('.redeem-btn').forEach(button => {
        button.removeEventListener('click', handleRedeemClick); 
        button.addEventListener('click', handleRedeemClick);
    });
}

// Separate handler function for redeem button clicks
async function handleRedeemClick(event) {
    if (!currentUsername) {
        showCustomModal("Login Required", "Please log in to redeem rewards.");
        return;
    }

    const rewardId = event.target.dataset.rewardId;
    const rewardCost = parseInt(event.target.dataset.rewardCost, 10);
    const rewardName = rewards.find(r => r.id === rewardId)?.name || "Unknown Reward";

    const confirmRedeem = await showCustomModal(
        "Confirm Redemption",
        `Are you sure you want to redeem "${rewardName}" for ${rewardCost} points?`,
        'confirm'
    );
    if (!confirmRedeem) return;

    if (userPoints < rewardCost) {
        showCustomModal("Redemption Failed", "Not enough points to redeem this reward.");
        return;
    }

    userPoints = Math.max(0, userPoints - rewardCost);
    addHistoryEntry("Redeemed reward", rewardName, "Reward", -rewardCost, 0);
    showCustomModal("Redemption Successful!", `You have successfully redeemed "${rewardName}". Your new points balance is displayed.`);
    updateUI(); // This will trigger saveUserDataToLocalStorage
}


// --- Leaflet Map Functionality ---

/**
 * Initializes the Leaflet map.
 */
function initializeMap() {
    if (map !== null) {
        map.remove(); // Remove existing map instance if any
    }
    console.log("Initializing Leaflet map...");
    // Set map view to a central location in Universiti Malaya
    map = L.map('map').setView([3.1190, 101.6534], 15); // Centered on UM with a closer zoom
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Invalidate map size after initialization to ensure it renders correctly
    map.invalidateSize();
    console.log("Leaflet map initialized.");
}

/**
 * Gets the user's current geolocation and displays it on the Leaflet map.
 */
async function getUserLocation() {
    // If a TEST_USER_LOCATION is defined (uncommented), use it instead of browser geolocation
    if (typeof TEST_USER_LOCATION !== 'undefined' && TEST_USER_LOCATION !== null) {
        userLocation = TEST_USER_LOCATION;
        mapStatusElement.textContent = `Using test location: Lat ${userLocation[0].toFixed(4)}, Lng ${userLocation[1].toFixed(4)}`;
        if (userMarker) {
            userMarker.remove();
        }
        userMarker = L.marker(userLocation).addTo(map).bindPopup("Test Location").openPopup();
        
        const allPoints = companyBins.map(bin => bin.coordinates).filter(Boolean);
        allPoints.push(userLocation); // Include test user location for map bounds
        if (allPoints.length > 0) {
            map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
        } else {
            map.setView(userLocation, 15); // Fallback if no bins
        }
        renderMapMarkers(); // Render bin markers with test user location
        return; // Exit the function, don't try actual geolocation
    }

    // Original geolocation logic if TEST_USER_LOCATION is not defined
    if ("geolocation" in navigator) {
        try {
            const position = await new Promise((resolve, reject) => {
                // Request current position
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
            });
            userLocation = [position.coords.latitude, position.coords.longitude];
            
            // Clear existing user marker if any
            if (userMarker) {
                userMarker.remove();
            }

            userMarker = L.marker(userLocation).addTo(map)
                .bindPopup("You are here").openPopup();
            
            // Re-center map to include user and bins
            const allPoints = companyBins.map(bin => bin.coordinates).filter(Boolean);
            if (userLocation) {
                allPoints.push(userLocation);
            }
            if (allPoints.length > 0) {
                map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
            } else {
                map.setView(userLocation, 15); // Fallback if no bins
            }
            
            mapStatusElement.textContent = `Your location: Lat ${userLocation[0].toFixed(4)}, Lng ${userLocation[1].toFixed(4)}`;
            renderMapMarkers(); // Render bin markers after user location is known
        } catch (error) {
            console.error("Error getting user location:", error);
            userLocation = [3.1190, 101.6534]; // Always set to default UM location on error
            
            // Clear existing user marker if any
            if (userMarker) {
                userMarker.remove();
            }
            // Add a marker for the default/fallback location
            userMarker = L.marker(userLocation).addTo(map)
                .bindPopup("Default Location (Access Denied/Error)").openPopup();

            if (error.code === error.PERMISSION_DENIED) {
                if (mapStatusElement) {
                    mapStatusElement.textContent = "Location access denied. Displaying bins around Universiti Malaya.";
                }
                showCustomModal(
                    "Location Access Denied",
                    "To show nearby bins based on your actual location, please enable location access for this site in your browser settings (e.g., Chrome: padlock icon in URL bar > Site settings > Location > Allow). You might need to clear previous site permissions if you denied them before. Displaying bins around Universiti Malaya instead.",
                    'alert', null, [], 8000 // Longer auto-close for detailed instructions
                );
            } else if (error.code === error.TIMEOUT) {
                if (mapStatusElement) {
                    mapStatusElement.textContent = "Location request timed out. Displaying bins around Universiti Malaya.";
                }
                showCustomModal(
                    "Location Error: Timeout",
                    "Could not get your location within the allowed time. This might be due to a weak GPS signal or slow connection. Displaying bins around Universiti Malaya.",
                    'alert', null, [], 5000
                );
            }
            else {
                if (mapStatusElement) {
                    mapStatusElement.textContent = "Could not get your location. Displaying bins around Universiti Malaya.";
                }
                showCustomModal(
                    "Location Error",
                    "Could not get your location due to an unexpected error. Please check your internet connection and try refreshing the page. Displaying bins around Universiti Malaya instead.",
                    'alert', null, [], 6000
                );
            }
            // Ensure map still renders with fallback user location
            renderMapMarkers();
        }
    } else {
        userLocation = [3.1190, 101.6534]; // Set to default UM location
        if (mapStatusElement) {
            mapStatusElement.textContent = "Geolocation is not supported by your browser. Displaying bins around Universiti Malaya.";
        }
        showCustomModal(
            "Browser Compatibility",
            "Geolocation is not supported by your browser. Please consider using a modern browser. Displaying bins around Universiti Malaya.",
            'alert', null, [], 7000
        );
        renderMapMarkers(); // Render bins even without user location
    }
}

/**
 * Renders bin markers on the Leaflet Map and provides textual suggestions.
 */
function renderMapMarkers() {
    if (!map || typeof L === 'undefined') {
        console.warn("Map or Leaflet (L) not ready for rendering bins.");
        return;
    }

    // Clear existing bin markers
    binMarkers.forEach(marker => marker.remove());
    binMarkers = [];
    suggestionListEl.innerHTML = '';
    nearbySuggestionsEl.classList.add('hidden');

    const allPointsForMapBounds = []; // All points (user + bins) for map fitting

    // Add user location to points for map bounds
    if (userLocation) {
        allPointsForMapBounds.push(userLocation);
    }

    companyBins.forEach(bin => { // Using companyBins for map markers
        if (bin.coordinates && bin.coordinates.length === 2) {
            const markerColor = getStatusColorForMap(bin.status);
            const binMarker = L.circleMarker(bin.coordinates, {
                radius: 8,
                fillColor: markerColor,
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map)
            .bindPopup(`<b>${bin.type} Bin</b><br>Location: ${bin.location}<br>Fill: ${bin.fillLevel}%<br>Status: ${bin.status}`);
            
            binMarkers.push(binMarker);
            allPointsForMapBounds.push(bin.coordinates); // Always add all bins to map bounds
        }
    });

    // Fit map bounds to all collected points (user location + bins)
    if (allPointsForMapBounds.length > 0) {
        const bounds = L.latLngBounds(allPointsForMapBounds);
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Generate textual suggestions
    if (companyBins.length > 0) { // Always show suggestions if there are bins in the system
        nearbySuggestionsEl.classList.remove('hidden');
        let suggestionsHtml = '';
        
        // Sort bins by fill level (least full first) and then by distance if userLocation is available
        const sortedBins = [...companyBins]; // Sort companyBins
        if (userLocation) {
            sortedBins.sort((a, b) => {
                const distA = calculateDistance(userLocation[0], userLocation[1], a.coordinates[0], a.coordinates[1]);
                const distB = calculateDistance(userLocation[0], userLocation[1], b.coordinates[0], b.coordinates[1]); 
                if (a.fillLevel !== b.fillLevel) {
                    return a.fillLevel - b.fillLevel; // Prioritize less full
                }
                return distA - distB; // Then by distance
            });
        } else {
            sortedBins.sort((a, b) => a.fillLevel - b.fillLevel); // Just by fill level if no user location
        }

        // Add overflowing warning if applicable (for any bins that are full)
        const overflowingBinsInSystem = sortedBins.filter(bin => bin.fillLevel >= 80);
        if (overflowingBinsInSystem.length > 0) {
            suggestionsHtml += `<li class="text-red-500 font-bold">WARNING: Some bins are full! Consider these less full options:</li>`;
        }
        
        // Add actual bin suggestions
        sortedBins.forEach(bin => {
            let distanceText = '';
            if (userLocation) {
                const distance = calculateDistance(userLocation[0], userLocation[1], bin.coordinates[0], bin.coordinates[1]);
                distanceText = `(${(distance * 1000).toFixed(0)}m away)`;
            }
            suggestionsHtml += `<li><b>${bin.location} (${bin.fillLevel}% full) ${distanceText}</li>`;
        });
        
        suggestionListEl.innerHTML = suggestionsHtml;

    } else {
        nearbySuggestionsEl.classList.add('hidden');
        suggestionListEl.innerHTML = `<li>No bins are currently available.</li>`;
    }
}

/**
 * Helper function to get Leaflet marker color (hex code) based on bin status.
 * @param {string} status - The status of the bin.
 * @returns {string} Hex color code.
 */
function getStatusColorForMap(status) {
    switch (status) {
        case 'Normal': return '#22C55E'; // green-500
        case 'Full': return '#EF4444';   // red-500
        case 'Service Required': return '#F59E0B'; // yellow-500
        default: return '#9CA3AF'; // gray-400
    }
}

/**
 * Calculates the distance between two geographical points using Haversine formula.
 * @param {number} lat1 - Latitude of point 1.
 * @param {number} lon1 - Longitude of point 1.
 * @param {number} lat2 - Latitude of point 2.
 * @param {number} lon2 - Longitude of point 2.
 * @returns {number} Distance in kilometers.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
}

// --- Teachable Machine Model Initialization ---
async function initTeachableMachine() {
    if (model && webcam) { // If already initialized, just ensure webcam is playing
        try {
            await webcam.play();
            loadingCameraMessage.classList.add('hidden'); // Hide loading if already running
            throwWasteBtn.disabled = false; // Enable if camera is working
            window.requestAnimationFrame(loop); // Ensure loop continues
        } catch (error) {
            console.error("Error resuming webcam:", error);
            loadingCameraMessage.textContent = "Failed to resume camera. Please ensure camera access is allowed and refresh the page.";
            loadingCameraMessage.classList.remove('hidden'); // Ensure message is visible
            showCustomModal(
                "Camera Access Denied",
                "Could not resume webcam. Please ensure you have granted camera access in your browser settings and try again.",
                'alert', null, [], 5000
            );
            throwWasteBtn.disabled = true; // Disable throw waste button if camera fails
            labelContainer.innerHTML = 'Camera unavailable. Waste identification not possible.';
        }
        return;
    }

    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    // Load the model and metadata
    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    } catch (error) {
        console.error("Error loading Teachable Machine model:", error);
        loadingCameraMessage.textContent = "Failed to load AI model. Please check network connection.";
        loadingCameraMessage.classList.remove('hidden');
        showCustomModal(
            "Model Load Error",
            "Could not load the waste identification model. Please check your internet connection and refresh.",
            'alert', null, [], 5000
        );
        throwWasteBtn.disabled = true; // Disable throw waste button if model fails
        labelContainer.innerHTML = 'AI model unavailable. Waste identification not possible.';
        return; // Exit if model failed to load
    }

    // Setup the webcam
    try {
        // MODIFIED: Increased webcam resolution to 400x400
        webcam = new tmImage.Webcam(400, 400, true); // width, height, flip
        await webcam.setup(); // request access to the webcam
        await webcam.play();
        loadingCameraMessage.classList.add('hidden'); // Hide loading message once camera is ready
        throwWasteBtn.disabled = false; // Enable throw waste button once camera is ready
        window.requestAnimationFrame(loop);
    } catch (error) {
        console.error("Error initializing webcam:", error);
        loadingCameraMessage.textContent = "Failed to load camera. Please ensure camera access is allowed and refresh the page.";
        loadingCameraMessage.classList.remove('hidden'); // Ensure message is visible
        showCustomModal(
            "Camera Access Denied",
            "Could not start webcam. Please ensure you have granted camera access in your browser settings and try again.",
            'alert', null, [], 5000
        );
        throwWasteBtn.disabled = true; // Disable throw waste button if camera fails
        labelContainer.innerHTML = 'Camera unavailable. Waste identification not possible.';
        return; // Exit if webcam setup failed
    }

    // Append elements to the DOM
    webcamContainer.innerHTML = ''; // Clear any existing content
    webcamContainer.appendChild(webcam.canvas);
}

async function loop() {
    if (!webcam || !model) return; // Exit if webcam or model is not initialized
    webcam.update(); // update the webcam frame
    await predict();
    window.requestAnimationFrame(loop);
}

// run the webcam image through the image model
async function predict() {
    if (!webcam || !model) return; // Ensure webcam and model are ready before predicting
    // Predict the image.
    const prediction = await model.predict(webcam.canvas);
    let highestPrediction = { className: "No detection", probability: 0 };

    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction = prediction[i];
        if (classPrediction.probability > highestPrediction.probability) {
            highestPrediction = classPrediction;
        }
    }

    predictedWasteType = highestPrediction.className;
    predictionConfidence = highestPrediction.probability;

    labelContainer.innerHTML = `Detected: <b>${predictedWasteType}</b> (${(predictionConfidence * 100).toFixed(1)}% confidence)`;
}
