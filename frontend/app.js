// ============================================
// CareCompass AI - Application Logic
// ============================================
// This file contains all the JavaScript for:
// - Firebase authentication
// - Case creation and AI triage
// - Patient records management
// - Dashboard statistics
// - Trend analysis
//
// SETUP INSTRUCTIONS:
// 1. Create a Firebase project at https://console.firebase.google.com
// 2. Enable Email/Password authentication
// 3. Create a Firestore database
// 4. Copy your Firebase config and replace the firebaseConfig object below
// 5. Make sure your backend server is running on http://localhost:3000

// ============================================
// FIREBASE CONFIGURATION
// ============================================

// Firebase configuration for CareCompass AI
const firebaseConfig = {
    apiKey: "AIzaSyAiclSQ9Zbtu6g5SjMBcg-z29IJhz7w99I",
    authDomain: "carecompass-ai-b2be0.firebaseapp.com",
    projectId: "carecompass-ai-b2be0",
    storageBucket: "carecompass-ai-b2be0.firebasestorage.app",
    messagingSenderId: "504870912156",
    appId: "1:504870912156:web:cc6992e67345355e6f6d59"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let currentUserRole = 'doctor'; // 'doctor' or 'admin'
let currentCaseData = null; // Stores the last analyzed case
let isLoadingPatients = false; // Loading flag for patients
let isSavingCase = false; // Guard for saving operations
let dashboardCases = []; // Cached cases for dashboard filtering
const ADMIN_CODE = 'ADMIN2024'; // Secret code for admin registration

// ============================================
// AUTH FUNCTIONS
// ============================================

/**
 * Show the login form
 */
function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    clearAuthError();
}

/**
 * Show the register form
 */
function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    clearAuthError();
}

/**
 * Handle user login
 */
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showAuthError('Please enter both email and password');
        return;
    }

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;

        // Load user data from Firestore
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            currentUserRole = userData.role || 'doctor';
        }

        showMainApp();
    } catch (error) {
        console.error('Login error:', error);
        showAuthError(getErrorMessage(error.code));
    }
}

/**
 * Handle user registration
 */
async function handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const adminCode = document.getElementById('adminCode').value.trim();

    if (!name || !email || !password) {
        showAuthError('Please fill in all required fields');
        return;
    }

    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
    }

    try {
        // Determine role based on admin code
        let role = 'doctor';
        if (adminCode) {
            const keyDoc = await db.collection('admin_keys').doc(adminCode).get();
            if (keyDoc.exists && keyDoc.data().status === 'active') {
                role = 'admin';
                // Mark key as used
                await db.collection('admin_keys').doc(adminCode).update({
                    status: 'used',
                    usedBy: email,
                    usedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                showAuthError('Invalid or already used admin code');
                return;
            }
        }

        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        currentUserRole = role;

        // Save user data to Firestore
        await db.collection('users').doc(currentUser.uid).set({
            name: name,
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showMainApp();
    } catch (error) {
        console.error('Registration error:', error);
        showAuthError(getErrorMessage(error.code));
    }
}

/**
 * Handle user logout
 */
async function handleLogout() {
    try {
        await auth.signOut();
        currentUser = null;
        currentUserRole = 'doctor';

        // Show auth section
        document.getElementById('authSection').classList.add('active');
        document.getElementById('mainSection').classList.remove('active');

        // Reset forms
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

/**
 * Show custom modal for admin upgrade
 */
function showAdminUpgradeModal() {
    const modal = document.getElementById('adminUpgradeModal');
    // Clear previous state
    document.getElementById('adminUpgradeCode').value = '';
    const errorDiv = document.getElementById('adminUpgradeError');
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');

    modal.classList.add('active');
}

/**
 * Close the admin upgrade modal
 */
function closeAdminUpgradeModal() {
    document.getElementById('adminUpgradeModal').classList.remove('active');
}

/**
 * Handle admin upgrade submission from custom modal
 */
async function submitAdminUpgrade() {
    const key = document.getElementById('adminUpgradeCode').value.trim();
    const errorDiv = document.getElementById('adminUpgradeError');

    if (!key) {
        errorDiv.textContent = 'Please enter an admin code';
        errorDiv.classList.add('show');
        return;
    }

    try {
        errorDiv.textContent = 'Verifying...';
        errorDiv.style.color = '#3b82f6';
        errorDiv.classList.add('show');

        const keyRef = db.collection('admin_keys').doc(key);

        await db.runTransaction(async (transaction) => {
            const keyDoc = await transaction.get(keyRef);

            if (!keyDoc.exists) {
                throw "Invalid admin code";
            }
            if (keyDoc.data().status !== 'active') {
                throw "Admin code already used";
            }

            // Update key status
            transaction.update(keyRef, {
                status: 'used',
                usedBy: currentUser.email,
                usedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update user role
            transaction.update(db.collection('users').doc(currentUser.uid), {
                role: 'admin'
            });
        });

        // Show success and reload
        errorDiv.textContent = '🚀 Upgrade successful! Refreshing...';
        errorDiv.style.color = '#16a34a';

        setTimeout(() => {
            location.reload();
        }, 1500);

    } catch (error) {
        console.error('Upgrade error:', error);
        errorDiv.textContent = '❌ ' + error;
        errorDiv.style.color = '#dc2626';
        errorDiv.classList.add('show');
    }
}


/**
 * Show the main app after successful login
 */
function showMainApp() {
    document.getElementById('authSection').classList.remove('active');
    document.getElementById('mainSection').classList.add('active');

    // Update user display
    db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (doc.exists) {
            const userData = doc.data();
            document.getElementById('userDisplayName').textContent = userData.name;

            const roleBadge = document.getElementById('userRoleBadge');
            roleBadge.textContent = currentUserRole.toUpperCase();
            roleBadge.className = 'role-badge ' + currentUserRole;
        }
    });

    // Load initial data
    loadExistingPatients();
    loadPatientRecords();
    loadDashboardStats();
}

/**
 * Show auth error message
 */
function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

/**
 * Clear auth error message
 */
function clearAuthError() {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(errorCode) {
    const messages = {
        'auth/email-already-in-use': 'This email is already registered',
        'auth/invalid-email': 'Invalid email address',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/weak-password': 'Password is too weak',
        'auth/network-request-failed': 'Network error. Please check your connection'
    };
    return messages[errorCode] || 'An error occurred. Please try again.';
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

/**
 * Show a specific tab
 */
function switchTab(tabName) {
    // Switch headers
    const headerIds = ['newCaseHeader', 'recordsHeader', 'dashboardHeader'];
    headerIds.forEach(id => {
        const header = document.getElementById(id);
        if (header) {
            header.classList.toggle('hidden', id !== `${tabName}Header`);
        }
    });

    // Update tab buttons
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('onclick')?.includes(`'${tabName}'`)) {
            tab.classList.add('active');
        }
    });

    // Update tab content
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));

    if (tabName === 'newCase') {
        document.getElementById('newCaseTab')?.classList.add('active');
    } else if (tabName === 'records') {
        document.getElementById('recordsTab')?.classList.add('active');
        loadPatientRecords();
    } else if (tabName === 'dashboard') {
        document.getElementById('dashboardTab')?.classList.add('active');
        loadDashboardStats();
    }
}

// ============================================
// CASE CREATION FUNCTIONS
// ============================================

/**
 * Handle patient type change (new vs existing)
 */
function handlePatientTypeChange() {
    const patientType = document.querySelector('input[name="patientType"]:checked').value;
    const newFields = document.getElementById('newPatientFields');
    const existingFields = document.getElementById('existingPatientFields');

    if (patientType === 'new') {
        newFields.classList.remove('hidden');
        existingFields.classList.add('hidden');
        document.getElementById('patientAge').value = '';
        document.getElementById('patientName').value = '';
    } else {
        newFields.classList.add('hidden');
        existingFields.classList.remove('hidden');
        loadExistingPatients(); // Prefetch patients for search
    }
}

let allPatientsList = []; // Memory cache for fast searching

async function loadExistingPatients() {
    if (isLoadingPatients) return;
    isLoadingPatients = true;

    try {
        let query = db.collection('patients');
        if (currentUserRole !== 'admin') {
            query = query.where('doctorId', '==', currentUser.uid);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        allPatientsList = [];

        snapshot.forEach(doc => {
            allPatientsList.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`Cached ${allPatientsList.length} patients for search`);
    } catch (error) {
        console.error('Error loading patients:', error);
    } finally {
        isLoadingPatients = false;
    }
}

/**
 * Handle live search in the patient registry
 */
function handlePatientSearch() {
    const input = document.getElementById('patientSearchInput');
    const resultsContainer = document.getElementById('patientSearchResults');
    const clearBtn = document.getElementById('clearSearchBtn');
    const query = input.value.toLowerCase().trim();

    if (!query) {
        resultsContainer.classList.remove('active');
        clearBtn?.classList.remove('active');
        return;
    }

    clearBtn?.classList.add('active');

    // Filter local cache
    const matches = allPatientsList.filter(p =>
        p.name.toLowerCase().includes(query)
    ).slice(0, 10); // Show top 10 matches

    if (matches.length > 0) {
        resultsContainer.innerHTML = matches.map(p => {
            // Highlight matching text
            const name = p.name;
            const index = name.toLowerCase().indexOf(query);
            let displayName = name;

            if (index >= 0) {
                const before = name.substring(0, index);
                const match = name.substring(index, index + query.length);
                const after = name.substring(index + query.length);
                displayName = `${before}<span class="search-result-highlight">${match}</span>${after}`;
            }

            return `
                <div class="search-result-item" onclick="selectPatientFromSearch('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.age || ''}')">
                    <div class="search-icon-circle">👤</div>
                    <div class="search-result-content">
                        <span class="search-result-name">${displayName}</span>
                        <span class="search-result-meta">Age: ${p.age || 'N/A'} • ID: ...${p.id.slice(-5)}</span>
                    </div>
                </div>
            `;
        }).join('');
        resultsContainer.classList.add('active');
    } else {
        resultsContainer.innerHTML = `
            <div class="p-6 text-center">
                <div class="text-3xl mb-2">🔍</div>
                <div class="text-sm text-slate-500 font-bold">No patients found</div>
                <div class="text-xs text-slate-400">Try a different name or create a new patient</div>
            </div>
        `;
        resultsContainer.classList.add('active');
    }
}

/**
 * Clear the current search
 */
function clearPatientSearch() {
    const input = document.getElementById('patientSearchInput');
    const resultsContainer = document.getElementById('patientSearchResults');
    const clearBtn = document.getElementById('clearSearchBtn');

    input.value = '';
    input.focus();
    resultsContainer.classList.remove('active');
    clearBtn?.classList.remove('active');

    // Reset selection hidden fields
    document.getElementById('existingPatientId').value = '';
    document.getElementById('patientAge').value = '';
}

/**
 * Select a patient from search results
 */
function selectPatientFromSearch(id, name, age) {
    document.getElementById('existingPatientId').value = id;
    document.getElementById('patientSearchInput').value = name;
    document.getElementById('patientAge').value = age;

    // Hide results
    document.getElementById('patientSearchResults').classList.remove('active');
    console.log(`Selected patient: ${name} [${id}]`);
}

/**
 * Handle selection of an existing patient (auto-populate age)
 */
async function handleExistingPatientSelection() {
    const patientId = document.getElementById('existingPatientSelect').value;
    if (!patientId) return;

    try {
        const patientDoc = await db.collection('patients').doc(patientId).get();
        if (patientDoc.exists) {
            const patientData = patientDoc.data();
            if (patientData.age) {
                document.getElementById('patientAge').value = patientData.age;
            } else {
                document.getElementById('patientAge').value = '';
            }
        }
    } catch (error) {
        console.error('Error fetching patient age:', error);
    }
}

/**
 * Submit a new case for AI analysis (doesn't save yet)
 */
async function submitCase() {
    const patientType = document.querySelector('input[name="patientType"]:checked').value;
    const symptoms = document.getElementById('symptoms').value.trim();
    const vitals = document.getElementById('vitals').value.trim();

    let patientName, patientAge, patientId;

    // Age is now always pulled from the persistent input field
    patientAge = document.getElementById('patientAge').value.trim();

    if (patientType === 'new') {
        patientName = document.getElementById('patientName').value.trim();

        if (!patientName) {
            showCaseError('Please enter patient name');
            return;
        }
    } else {
        // For existing patients, name comes from the search input
        patientName = document.getElementById('patientSearchInput').value.trim();
        patientId = document.getElementById('existingPatientId').value;

        if (!patientName) {
            showCaseError('Please search and select a patient');
            return;
        }
    }

    if (!symptoms) {
        showCaseError('Please enter symptoms');
        return;
    }

    // Show loading
    document.getElementById('analyzingSpinner').classList.remove('hidden');
    document.getElementById('analyzeBtn').classList.add('hidden');
    clearCaseError();

    try {
        // Call backend AI analysis
        const response = await fetch('https://carecompass-backend-jhll.onrender.com/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                patientName,
                age: patientAge,
                symptoms,
                vitals
            })
        });

        const triageData = await response.json();

        // Store current case data (but don't save to database yet)
        currentCaseData = {
            patientType,
            patientName,
            patientAge,
            patientId,
            symptoms,
            vitals,
            triageData
        };

        // Display results (the function handles showing/hiding cards)
        displayTriageResults(triageData);

        // Hide loading
        document.getElementById('analyzingSpinner').classList.add('hidden');
        document.getElementById('analyzeBtn').classList.remove('hidden');
    } catch (error) {
        console.error('Error submitting case:', error);
        document.getElementById('analyzingSpinner').classList.add('hidden');
        document.getElementById('analyzeBtn').classList.remove('hidden');
        showCaseError('Failed to analyze case. Please check if the backend server is running.');
    }
}

/**
 * Save the analyzed case to database
 */
async function saveCase() {
    if (!currentCaseData) {
        alert('No case data to save');
        return;
    }

    if (isSavingCase) return;
    isSavingCase = true;

    // Update the button to show processing
    const saveBtn = document.getElementById('saveCaseBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="animate-pulse">⌛ Committing...</span>';
    }

    try {
        const { patientType, patientName, patientAge, patientId, symptoms, vitals, triageData } = currentCaseData;

        let finalPatientId = patientId;

        // If this is a new patient, create patient record
        if (patientType === 'new') {
            // Check if a patient with this name exists (filter by doctorId in memory to avoid index requirement)
            const existingCheck = await db.collection('patients')
                .where('name', '==', patientName)
                .get();

            const myExistingPatient = existingCheck.docs.find(doc => doc.data().doctorId === currentUser.uid);

            if (myExistingPatient) {
                const confirmNew = confirm(`⚠️ Warning: A patient named "${patientName}" already exists in your records. Do you want to create a NEW record anyway? \n\nClick Cancel to use the existing record instead.`);
                if (!confirmNew) {
                    finalPatientId = myExistingPatient.id;
                } else {
                    const patientRef = await db.collection('patients').add({
                        name: patientName,
                        age: patientAge,
                        doctorId: currentUser.uid,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    finalPatientId = patientRef.id;
                }
            } else {
                const patientRef = await db.collection('patients').add({
                    name: patientName,
                    age: patientAge,
                    doctorId: currentUser.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                finalPatientId = patientRef.id;
            }
        }

        // Save case to Firestore
        await db.collection('cases').add({
            patientId: finalPatientId,
            patientName: patientName,
            patientAge: patientAge,
            symptoms: symptoms,
            vitals: vitals,
            doctorId: currentUser.uid,
            triageData: triageData,
            isActive: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Show success message
        alert('✅ Case saved successfully!');

        // Update the button to show it's saved
        const saveBtn = document.getElementById('saveCaseBtn');
        if (saveBtn) {
            saveBtn.textContent = '✓ Case Saved';
            saveBtn.disabled = true;
            saveBtn.style.background = '#10b981';
        }

    } catch (error) {
        console.error('Error saving case:', error);
        alert('❌ Failed to save case. Please try again.');

        // Reset state on error
        isSavingCase = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Commit to Patient History';
        }
    }
}

/**
 * Display AI triage results
 */
function displayTriageResults(triageData) {
    // Hide form, show results
    document.getElementById('intakeForm').classList.add('hidden');
    document.getElementById('triageResults').classList.remove('hidden');

    // Risk badge
    const riskBadge = document.getElementById('riskBadge');
    riskBadge.textContent = triageData.risk_level;

    // Set risk color based on level
    const riskLevel = triageData.risk_level.toLowerCase();
    let badgeClasses = 'text-xl font-black px-8 py-3 rounded-2xl uppercase tracking-tighter ';

    if (riskLevel === 'critical') badgeClasses += 'bg-red-600 text-white shadow-lg shadow-red-600/20';
    else if (riskLevel === 'high') badgeClasses += 'bg-orange-500 text-white shadow-lg shadow-orange-500/20';
    else if (riskLevel === 'moderate') badgeClasses += 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/20';
    else badgeClasses += 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20';

    riskBadge.className = badgeClasses;

    // Risk score
    document.getElementById('riskScore').textContent = triageData.risk_score;

    // Key concerns
    const concernsList = document.getElementById('keyConcerns');
    concernsList.innerHTML = '';
    triageData.key_concerns.forEach(concern => {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-3 text-rose-900 text-sm font-bold bg-white/50 p-3 rounded-xl border border-rose-100/50';
        li.innerHTML = `<span class="text-rose-400 mt-0.5">•</span> <span>${concern}</span>`;
        concernsList.appendChild(li);
    });

    // Triage recommendation
    document.getElementById('triageRecommendation').textContent = triageData.triage_recommendation;

    // Clinical summary
    document.getElementById('clinicalSummary').textContent = triageData.clinical_summary;

    // Tests advised
    document.getElementById('testsAdvised').textContent = (triageData.tests_advised && triageData.tests_advised.length > 0)
        ? triageData.tests_advised.join(', ')
        : 'No specific tests recommended';

    // First aid steps
    document.getElementById('firstAid').textContent = (triageData.first_aid_steps && triageData.first_aid_steps.length > 0)
        ? triageData.first_aid_steps.join('. ')
        : 'No immediate first aid required';

    // Referral
    document.getElementById('referralTo').textContent = triageData.when_to_refer || 'N/A';
}

/**
 * Reset the case form to create another case
 */
function resetCaseForm() {
    // Show form, hide results
    document.getElementById('intakeForm').classList.remove('hidden');
    document.getElementById('triageResults').classList.add('hidden');

    // Clear form fields
    document.getElementById('patientName').value = '';
    document.getElementById('patientAge').value = '';
    document.getElementById('symptoms').value = '';
    document.getElementById('vitals').value = '';
    // Clear search and selection fields (dropdown was removed in refactor)
    const searchInput = document.getElementById('patientSearchInput');
    const existingId = document.getElementById('existingPatientId');
    if (searchInput) searchInput.value = '';
    if (existingId) existingId.value = '';

    // Reset to new patient
    document.querySelector('input[name="patientType"][value="new"]').checked = true;
    handlePatientTypeChange();

    // Reload patient list
    loadExistingPatients();
}

/**
 * Show case error message
 */
function showCaseError(message) {
    const errorDiv = document.getElementById('caseError');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

/**
 * Clear case error message
 */
function clearCaseError() {
    const errorDiv = document.getElementById('caseError');
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
}

// ============================================
// PATIENT RECORDS FUNCTIONS
// ============================================

/**
 * Load and display patient records
 */
async function loadPatientRecords() {
    try {
        const recordsList = document.getElementById('patientRecordsList');
        recordsList.innerHTML = '<p>Loading patient records...</p>';

        // Get all cases associated with this doctor (or all if admin)
        let casesQuery = db.collection('cases');
        if (currentUserRole !== 'admin') {
            casesQuery = casesQuery.where('doctorId', '==', currentUser.uid);
        }

        const casesSnapshot = await casesQuery.orderBy('createdAt', 'desc').get();

        if (casesSnapshot.empty) {
            recordsList.innerHTML = '<p style="color: #64748b;">No patient records found.</p>';
            return;
        }

        recordsList.innerHTML = '';

        // Group cases by patient name
        const groups = {};
        casesSnapshot.forEach(doc => {
            const data = doc.data();
            const name = data.patientName;
            if (!groups[name]) {
                groups[name] = {
                    name: name,
                    age: data.patientAge,
                    cases: []
                };
            }
            groups[name].cases.push({
                id: doc.id,
                ...data
            });
        });

        // Create cards for each group
        Object.values(groups).forEach(group => {
            // Calculate trend based on their cases
            const trend = calculateTrend(group.cases);

            // For the patient ID in the card, we just use the ID from the latest case
            // as a reference for the accordion toggle
            const dummyPatientId = group.cases[0].patientId || `group-${group.name.replace(/\s+/g, '-')}`;

            const patientCard = createPatientCard({ name: group.name, age: group.age }, dummyPatientId, group.cases, trend);
            recordsList.appendChild(patientCard);
        });

    } catch (error) {
        console.error('Error loading patient records:', error);
        document.getElementById('patientRecordsList').innerHTML =
            '<p style="color: #dc2626;">Error loading records. Please try again.</p>';
    }
}

/**
 * Create a patient card element
 */
function createPatientCard(patient, patientId, cases, trend) {
    const card = document.createElement('div');
    card.className = 'group surface-card overflow-hidden transition-all active:scale-[0.99] mb-4';

    const header = document.createElement('div');
    header.className = 'px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors';
    header.onclick = () => togglePatientTimeline(patientId);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'flex flex-col gap-0.5';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center gap-2';

    const name = document.createElement('div');
    name.className = 'text-base font-extrabold text-slate-900 group-hover:text-medical-600 transition-colors';
    name.textContent = patient.name;

    const trendBadge = document.createElement('div');
    trendBadge.className = `text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${trend.class}`;
    trendBadge.textContent = trend.text;

    topRow.appendChild(name);
    topRow.appendChild(trendBadge);

    const meta = document.createElement('div');
    meta.className = 'text-xs font-bold text-slate-400';
    meta.textContent = `Age: ${patient.age || 'N/A'} • ${cases.length} visit${cases.length > 1 ? 's' : ''}`;

    nameDiv.appendChild(topRow);
    nameDiv.appendChild(meta);

    header.appendChild(nameDiv);

    const timeline = document.createElement('div');
    timeline.className = 'patient-timeline max-h-0 overflow-hidden bg-slate-50/50 transition-all duration-300 ease-in-out';
    timeline.id = `timeline-${patientId}`;

    const timelineInner = document.createElement('div');
    timelineInner.className = 'p-4 space-y-2 border-t border-slate-100';

    cases.forEach((caseData, index) => {
        const caseItem = document.createElement('div');
        caseItem.className = 'p-4 bg-white rounded-xl border border-slate-100 cursor-pointer hover:border-medical-600 hover:shadow-md transition-all flex items-center justify-between group/item';
        caseItem.onclick = (e) => {
            e.stopPropagation();
            showCaseModal(caseData);
        };

        const leftSide = document.createElement('div');
        const date = document.createElement('div');
        date.className = 'text-[10px] font-black text-slate-400 uppercase tracking-widest';
        date.textContent = formatDate(caseData.createdAt);

        const summary = document.createElement('div');
        summary.className = 'text-sm font-bold text-slate-700 mt-1 line-clamp-1';
        summary.textContent = caseData.symptoms;

        leftSide.appendChild(date);
        leftSide.appendChild(summary);

        const riskIndicator = document.createElement('div');
        const riskLevel = caseData.triageData.risk_level.toLowerCase();
        let indicatorColor = 'bg-slate-200';
        if (riskLevel === 'critical') indicatorColor = 'bg-red-500';
        else if (riskLevel === 'high') indicatorColor = 'bg-orange-500';
        else if (riskLevel === 'moderate') indicatorColor = 'bg-amber-400';
        else indicatorColor = 'bg-emerald-500';

        riskIndicator.className = `w-2 h-2 rounded-full ${indicatorColor} group-hover/item:scale-150 transition-transform`;

        caseItem.appendChild(leftSide);
        caseItem.appendChild(riskIndicator);
        timelineInner.appendChild(caseItem);
    });

    timeline.appendChild(timelineInner);
    card.appendChild(header);
    card.appendChild(timeline);

    return card;
}

/**
 * Toggle patient timeline expansion
 */
function togglePatientTimeline(patientId) {
    const timeline = document.getElementById(`timeline-${patientId}`);
    if (timeline.style.maxHeight) {
        timeline.style.maxHeight = null;
    } else {
        timeline.style.maxHeight = timeline.scrollHeight + "px";
    }
}

/**
 * Calculate trend for a patient based on risk scores
 */
function calculateTrend(cases) {
    if (cases.length === 0) {
        return { text: 'New Patient', class: 'bg-slate-100 text-slate-600' };
    }

    const latestCase = cases[0].triageData;
    const riskLevel = latestCase.risk_level;
    const riskScore = latestCase.risk_score;

    let riskClass = 'bg-slate-100 text-slate-600';
    const lowRisk = riskLevel.toLowerCase();
    if (lowRisk === 'critical') riskClass = 'bg-rose-100 text-rose-700';
    else if (lowRisk === 'high') riskClass = 'bg-orange-100 text-orange-700';
    else if (lowRisk === 'moderate') riskClass = 'bg-amber-100 text-amber-700';
    else if (lowRisk === 'low') riskClass = 'bg-emerald-100 text-emerald-700';

    if (cases.length < 2) {
        return { text: riskLevel, class: riskClass };
    }

    // Compare latest two visits
    const previousScore = cases[1].triageData.risk_score;
    const difference = riskScore - previousScore;

    let arrow = ' →';
    if (difference < -10) arrow = ' ↓';
    else if (difference > 10) arrow = ' ↑';

    return { text: riskLevel + arrow, class: riskClass };
}

/**
 * Format Firestore timestamp to readable date
 */
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown date';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================
// MODAL FUNCTIONS
// ============================================

/**
 * Show case details in modal
 */
async function showCaseModal(caseData) {
    const modal = document.getElementById('caseModal');
    const modalContent = document.getElementById('modalContent');

    // Store current case for PDF export
    currentCaseData = caseData;

    // Fetch latest clinical reference from patient record
    let displayRef = caseData.patientId;
    if (caseData.patientId) {
        try {
            const patientDoc = await db.collection('patients').doc(caseData.patientId).get();
            if (patientDoc.exists && patientDoc.data().clinicalRef) {
                displayRef = patientDoc.data().clinicalRef;
            }
        } catch (error) {
            console.error('Error fetching clinical ref:', error);
        }
    }

    const triageData = caseData.triageData;
    const riskLevel = triageData.risk_level.toLowerCase();

    let riskColor = 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (riskLevel === 'critical') riskColor = 'text-rose-600 bg-rose-50 border-rose-100';
    else if (riskLevel === 'high') riskColor = 'text-orange-600 bg-orange-50 border-orange-100';
    else if (riskLevel === 'moderate') riskColor = 'text-amber-600 bg-amber-50 border-amber-100';

    modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div class="space-y-4">
                <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patient Details</div>
                    <div class="text-lg font-black text-slate-800">${caseData.patientName}</div>
                    <div class="text-sm font-bold text-slate-500">
                        Age: ${caseData.patientAge || 'N/A'} • 
                        Ref: <span id="modalRefDisplay" class="cursor-pointer hover:text-medical-600 underline decoration-dotted transition-colors" onclick="editClinicalRef('${caseData.patientId}', '${displayRef}')">${displayRef}</span>
                    </div>
                </div>
                <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recording Clinician</div>
                    <div id="modalClinicianDisplay" class="text-sm font-bold text-slate-700 cursor-pointer hover:text-medical-600 underline decoration-dotted transition-colors" onclick="editClinicianName('${caseData.id}', '${caseData.clinicianName || 'Medical Data Terminal #1'}')">
                        ${caseData.clinicianName || 'Medical Data Terminal #1'}
                    </div>
                    <div class="text-[10px] font-bold text-slate-400 mt-1">${formatDate(caseData.createdAt)}</div>
                </div>
            </div>
            <div class="p-6 rounded-3xl border-2 ${riskColor.split(' ')[2]} flex flex-col items-center justify-center text-center relative">
                <div class="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60 flex items-center gap-1.5">
                    Priority Score
                    <div class="relative group">
                        <span class="cursor-help text-xs opacity-50 hover:opacity-100 transition-opacity">ⓘ</span>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl leading-relaxed text-center normal-case tracking-normal">
                            Numerical clinical priority index (0-100) determining the urgency of medical intervention.
                        </div>
                    </div>
                </div>
                <div class="text-5xl font-black mb-2">${triageData.risk_score}</div>
                <div class="px-4 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${riskColor.split(' ').slice(0, 2).join(' ')}">
                    ${triageData.risk_level} Risk
                </div>
            </div>
        </div>

        <div class="space-y-8">
            <section>
                <h3 class="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs">🩺</span>
                    Clinical Presentation
                </h3>
                <div class="p-5 bg-white rounded-2xl border border-slate-100 text-slate-600 text-sm leading-relaxed whitespace-pre-line shadow-sm">
                    ${caseData.symptoms}
                </div>
            </section>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Vitals Matrix</h3>
                    <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm font-bold text-slate-700">
                        ${caseData.vitals || 'No vitals recorded in this session.'}
                    </div>
                </div>
                <div>
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">AI Recommendation</h3>
                    <div class="p-4 bg-medical-50 rounded-2xl border border-medical-100 text-sm font-bold text-medical-700 italic">
                        "${triageData.triage_recommendation}"
                    </div>
                </div>
            </section>

            <section>
                <h3 class="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-medical-100 flex items-center justify-center text-xs">📋</span>
                    Assessment Logic
                </h3>
                <div class="space-y-3">
                    <div class="p-4 bg-slate-50/50 rounded-2xl text-xs font-medium text-slate-500 leading-relaxed">
                        ${triageData.clinical_summary}
                    </div>
                    <div class="p-4 bg-rose-50/50 rounded-2xl">
                        <div class="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Primary Red Flags</div>
                        <ul class="space-y-2">
                            ${triageData.key_concerns.map(c => `<li class="text-xs font-bold text-rose-900 flex items-start gap-2"><span>•</span> ${c}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </section>
        </div>

        <div class="mt-8 p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[10px] font-bold text-amber-700 text-center leading-relaxed">
            ⚠️ CONFIDENTIAL CLINICAL DATA: This record is for authorized medical personnel only. The AI analysis is a pilot feature and not a replacement for independent clinical judgment.
        </div>
    `;

    modal.classList.add('active');
}

/**
 * Edit clinical reference for a patient
 */
async function editClinicalRef(patientId, currentRef) {
    if (!patientId || patientId === 'NEW') return;

    const newRef = prompt('Enter Clinical Reference (e.g. Hospital ID, Bed #):', currentRef);

    if (newRef !== null && newRef !== currentRef) {
        try {
            const refDisplay = document.getElementById('modalRefDisplay');
            refDisplay.textContent = 'Updating...';

            await db.collection('patients').doc(patientId).update({
                clinicalRef: newRef,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            refDisplay.textContent = newRef;
            // Update the onclick to store the new ref for subsequent prompts
            refDisplay.setAttribute('onclick', `editClinicalRef('${patientId}', '${newRef}')`);

            // Refresh list in background to show updated refs if we add them to the list UI
            loadPatientRecords();
        } catch (error) {
            console.error('Error updating ref:', error);
            alert('❌ Failed to update reference.');
            refDisplay.textContent = currentRef;
        }
    }
}

/**
 * Edit clinician name for a specific case
 */
async function editClinicianName(caseId, currentName) {
    if (!caseId) return;

    const newName = prompt('Enter Recording Clinician / Terminal ID:', currentName);

    if (newName !== null && newName !== currentName) {
        try {
            const clinicianDisplay = document.getElementById('modalClinicianDisplay');
            clinicianDisplay.textContent = 'Updating...';

            await db.collection('cases').doc(caseId).update({
                clinicianName: newName
            });

            clinicianDisplay.textContent = newName;
            clinicianDisplay.setAttribute('onclick', `editClinicianName('${caseId}', '${newName}')`);

            // Also update the global state if needed, but here we just update the specific case
            alert('✅ Clinician name updated for this record.');
        } catch (error) {
            console.error('Error updating clinician name:', error);
            alert('❌ Failed to update clinician name.');
            clinicianDisplay.textContent = currentName;
        }
    }
}

/**
 * Close the modal
 */
function closeModal() {
    document.getElementById('caseModal').classList.remove('active');
}

/**
 * Export case as PDF (uses browser print)
 */
function exportCasePDF() {
    window.print();
}

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

/**
 * Load dashboard statistics
 */
async function loadDashboardStats() {
    try {
        // Query cases based on role
        let casesQuery = db.collection('cases');
        if (currentUserRole !== 'admin') {
            casesQuery = casesQuery.where('doctorId', '==', currentUser.uid);
        }

        // We use just orderBy to be resilient to missing 'isActive' flags on old data
        // and to avoid needing complex composite indexes immediately.
        const snapshot = await casesQuery.orderBy('createdAt', 'desc').get();

        dashboardCases = [];
        let critical = 0;
        let high = 0;
        let moderate = 0;
        let low = 0;

        snapshot.forEach(doc => {
            const data = doc.data();

            // Resilience: If a case is explicitly marked inactive, skip it.
            // Otherwise, treat as active (handles legacy data missing the flag).
            if (data.isActive === false) return;

            const caseData = { id: doc.id, ...data };
            dashboardCases.push(caseData);

            const riskLevel = caseData.triageData.risk_level;

            if (riskLevel === 'Critical') critical++;
            else if (riskLevel === 'High') high++;
            else if (riskLevel === 'Moderate') moderate++;
            else if (riskLevel === 'Low') low++;
        });

        // Update UI Summary Numbers
        document.getElementById('totalCases').textContent = dashboardCases.length;
        document.getElementById('criticalCases').textContent = critical;
        document.getElementById('highCases').textContent = high;
        document.getElementById('moderateCases').textContent = moderate;
        document.getElementById('lowCases').textContent = low;

        // Auto-show 'All' filter results by default when dashboard loads
        // This ensures the list container isn't empty on first visit
        filterDashboardList('all');

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        // If there's an index error, we can catch it here and inform the user
        if (error.code === 'failed-precondition') {
            alert('Dashboard requires a Firestore index. Please check the console for the link.');
        }
    }
}

/**
 * Filter and display cases in the dashboard
 */
function filterDashboardList(riskLevel) {
    const listContainer = document.getElementById('dashboardFilteredList');
    const section = document.getElementById('dashboardFilterSection');
    const title = document.getElementById('filterResultsTitle');

    if (!listContainer || !section) return;

    listContainer.innerHTML = '';

    const filtered = riskLevel === 'all'
        ? dashboardCases
        : dashboardCases.filter(c => c.triageData.risk_level === riskLevel);

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="col-span-full p-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <div class="text-3xl mb-3">📂</div>
                <p class="text-sm font-bold text-slate-400">No active ${riskLevel !== 'all' ? riskLevel : ''} cases found</p>
            </div>
        `;
    } else {
        filtered.forEach(caseData => {
            const card = document.createElement('div');
            card.className = 'p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-medical-200 transition-all cursor-pointer flex items-center justify-between group slide-up';
            card.onclick = () => showCaseModal(caseData.id);

            const riskColors = {
                'Critical': 'bg-rose-100 text-rose-700',
                'High': 'bg-orange-100 text-orange-700',
                'Moderate': 'bg-amber-100 text-amber-700',
                'Low': 'bg-emerald-100 text-emerald-700'
            };

            card.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl group-hover:bg-medical-50 transition-colors">👤</div>
                    <div class="overflow-hidden">
                        <div class="text-sm font-black text-slate-800 truncate">${caseData.patientName}</div>
                        <div class="text-[10px] font-bold text-slate-400 truncate mt-0.5">${formatDate(caseData.createdAt)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <div class="text-right hidden sm:block">
                        <div class="text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${riskColors[caseData.triageData.risk_level] || 'bg-slate-100 text-slate-600'}">
                            ${caseData.triageData.risk_level}
                        </div>
                    </div>
                    <div class="w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-medical-600 group-hover:text-white group-hover:border-medical-600 transition-all">
                        →
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    title.innerHTML = `
        <span class="w-2 h-6 bg-medical-600 rounded-full"></span>
        ${riskLevel === 'all' ? 'Institutional Case Load' : `${riskLevel} Priority Queue`} (${filtered.length})
    `;

    section.classList.remove('hidden');

    // Smooth scroll with offset for the sidebar header
    setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

/**
 * Hide the dashboard filter section
 */
function hideDashboardFilter() {
    const section = document.getElementById('dashboardFilterSection');
    if (section) section.classList.add('hidden');
}

// ============================================
// INITIALIZATION
// ============================================

// Listen for auth state changes
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;

        // Load user data and show main app
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                currentUserRole = doc.data().role || 'doctor';

                // Show/hide admin upgrade section in dashboard
                const upgradeSection = document.getElementById('adminUpgradeSection');
                if (upgradeSection) {
                    upgradeSection.style.display = (currentUserRole === 'doctor') ? 'flex' : 'none';
                }

                showMainApp();
            }
        });
    } else {
        // User is signed out
        currentUser = null;
        const authSec = document.getElementById('authSection');
        authSec.classList.add('active');
        authSec.style.display = 'flex'; // Force centering flex
        document.getElementById('mainSection').classList.remove('active');
        document.getElementById('mainSection').style.display = 'none';
    }
});

// Close modal when clicking outside
document.getElementById('caseModal').addEventListener('click', function (event) {
    if (event.target === this) {
        closeModal();
    }
});

// Close admin upgrade modal when clicking outside
document.getElementById('adminUpgradeModal').addEventListener('click', function (event) {
    if (event.target === this) {
        closeAdminUpgradeModal();
    }
});

console.log('CareCompass AI initialized');
console.log('Connect to live backend: https://carecompass-backend-jhll.onrender.com');
