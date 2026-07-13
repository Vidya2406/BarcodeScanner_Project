/**
 * ScanVibe - QR & Barcode Scanner App Frontend Logic
 * This script controls camera streams, handles local image decoding,
 * and communicates scan records with the Flask SQLite server backend.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // DOM Element Declarations
    // ----------------------------------------------------
    const btnToggleScanner = document.getElementById('btn-toggle-scanner');
    const readerContainer = document.getElementById('reader-container');
    const cameraSelectContainer = document.getElementById('camera-select-container');
    const cameraSelect = document.getElementById('camera-select');
    
    const fileInput = document.getElementById('file-input');
    const fileFeedback = document.getElementById('file-feedback');
    
    const resultContainer = document.getElementById('result-container');
    const resultType = document.getElementById('result-type');
    const resultText = document.getElementById('result-text');
    const resultTime = document.getElementById('result-time');
    const saveStatus = document.getElementById('save-status');
    const btnCopy = document.getElementById('btn-copy');
    const btnOpenLink = document.getElementById('btn-open-link');
    
    const statusToast = document.getElementById('statusToast');
    const toastMessage = document.getElementById('toast-message');
    
    // Initialize the Bootstrap Toast instance (used for non-blocking alerts)
    const toast = new bootstrap.Toast(statusToast);

    // ----------------------------------------------------
    // State Variables
    // ----------------------------------------------------
    let html5QrCode = null;         // Instance of the camera scanner
    let scannerIsRunning = false;   // Scanner active/inactive flag
    let camerasList = [];           // Array of available camera objects

    // Instantiate html5QrCode library targeting the '#reader' HTML container
    try {
        html5QrCode = new Html5Qrcode("reader");
    } catch (e) {
        console.error("Failed to initialize Html5Qrcode library", e);
    }

    // ----------------------------------------------------
    // Helper & Feedback Utilities
    // ----------------------------------------------------
    
    /**
     * Triggers a sliding Toast alert to display operational results.
     * @param {string} message - Text notification.
     * @param {boolean} isSuccess - Success or Error flag for color styling.
     */
    function showAlert(message, isSuccess = true) {
        toastMessage.textContent = message;
        // Dynamically style Toast using Bootstrap utility classes
        statusToast.className = `toast align-items-center text-white border-0 ${isSuccess ? 'bg-success' : 'bg-danger'}`;
        toast.show();
    }

    /**
     * Checks if the scanned string is a valid HTTP URL.
     * @param {string} string - Scanned value.
     */
    function isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === "http:" || url.protocol === "https:";
        } catch (_) {
            return false;  
        }
    }

    // ----------------------------------------------------
    // Core Scan Logic & Database Synchronization
    // ----------------------------------------------------

    /**
     * Executes on successful barcode/QR code detection.
     * @param {string} decodedText - Decoded value.
     * @param {object} decodedResult - Metadata containing barcode format.
     */
    function handleScanSuccess(decodedText, decodedResult) {
        // Automatically stop the live camera stream to save resources and prevent loop scans
        if (scannerIsRunning) {
            toggleScanner();
        }

        const formatName = decodedResult.result.format.formatName || "QR_CODE";
        
        // Populate and display result elements
        resultContainer.classList.remove('d-none');
        saveStatus.classList.add('d-none'); // Hide save status until API confirms save success
        resultType.textContent = formatName.replace(/_/g, " ");
        resultText.textContent = decodedText;
        resultTime.textContent = new Date().toLocaleString();

        // Reveal the "Open Link" button if the value is an external web link
        if (isValidUrl(decodedText)) {
            btnOpenLink.href = decodedText;
            btnOpenLink.classList.remove('d-none');
        } else {
            btnOpenLink.classList.add('d-none');
        }

        // Send fetch request to synchronize the new scan entry with the Flask backend
        saveScanToDatabase(decodedText, formatName);
    }

    /**
     * Sends database insertion request to Flask server API.
     * @param {string} text - Scanned value.
     * @param {string} type - Scanned format.
     */
    function saveScanToDatabase(text, type) {
        fetch('/api/scans', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                barcode_value: text,
                barcode_type: type
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Server responded with error status");
            }
            return response.json();
        })
        .then(data => {
            // Update UI to indicate database save success
            showAlert("Saved Successfully");
            saveStatus.classList.remove('d-none'); // Reveal "Saved Successfully" badge
        })
        .catch(err => {
            console.error("API Error saving scan:", err);
            showAlert("Failed to save scan records.", false);
        });
    }

    // Copy decoded result value to system clipboard
    btnCopy.addEventListener('click', () => {
        const textToCopy = resultText.textContent;
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                showAlert("Copied to clipboard!");
            })
            .catch(err => {
                showAlert("Unable to access clipboard.", false);
            });
    });

    // ----------------------------------------------------
    // Live Camera Stream Controls
    // ----------------------------------------------------

    /**
     * Connects to the device's selected camera and starts the video feed.
     * @param {string} cameraId - Hardware ID of the camera.
     */
    function startScanning(cameraId) {
        // Setup scan options (frame rate and scanning region size)
        const config = {
            fps: 10,
            qrbox: function(width, height) {
                // Dynamically scale scanner viewport region (70% of parent width/height)
                const size = Math.min(width, height) * 0.7;
                return { width: size, height: size };
            }
        };

        html5QrCode.start(
            cameraId,
            config,
            (decodedText, decodedResult) => handleScanSuccess(decodedText, decodedResult),
            (errorMessage) => {
                // Ignore real-time frames decode failures to avoid logging overhead
            }
        )
        .then(() => {
            scannerIsRunning = true;
            btnToggleScanner.innerHTML = '<i class="bi bi-stop-fill me-2"></i>Stop Scanner';
            btnToggleScanner.className = "btn btn-danger btn-lg rounded-pill";
            readerContainer.classList.remove('d-none');
        })
        .catch(err => {
            console.error("Unable to start scanning stream.", err);
            showAlert("Camera access denied or device initialization error.", false);
        });
    }

    /**
     * Stops camera scanning and frees up camera hardware.
     */
    function stopScanning() {
        if (!html5QrCode) return;
        
        html5QrCode.stop()
            .then(() => {
                scannerIsRunning = false;
                btnToggleScanner.innerHTML = '<i class="bi bi-play-fill me-2"></i>Start Scanner';
                btnToggleScanner.className = "btn btn-primary btn-lg rounded-pill";
                readerContainer.classList.add('d-none');
            })
            .catch(err => {
                console.error("Failed to release camera hardware.", err);
            });
    }

    /**
     * Requests camera device clearance and handles toggling states.
     */
    function toggleScanner() {
        if (scannerIsRunning) {
            stopScanning();
        } else {
            // Retrieve list of cameras
            Html5Qrcode.getCameras()
                .then(cameras => {
                    camerasList = cameras;
                    if (cameras && cameras.length > 0) {
                        // Populate camera selector dropdown list
                        cameraSelect.innerHTML = '';
                        cameras.forEach((camera, index) => {
                            const option = document.createElement('option');
                            option.value = camera.id;
                            option.textContent = camera.label || `Camera ${index + 1}`;
                            cameraSelect.appendChild(option);
                        });

                        // Reveal dropdown only if multiple cameras exist (e.g., dual phone cameras)
                        if (cameras.length > 1) {
                            cameraSelectContainer.classList.remove('d-none');
                        }

                        // Initialize stream with the primary camera
                        startScanning(cameras[0].id);
                    } else {
                        showAlert("No cameras detected on this device.", false);
                    }
                })
                .catch(err => {
                    console.error("Error fetching camera hardware.", err);
                    showAlert("Camera permission is required to scan.", false);
                });
        }
    }

    // Bind click event handler to the start/stop scan trigger button
    btnToggleScanner.addEventListener('click', toggleScanner);

    // Watch camera selection changes to switch feeds
    cameraSelect.addEventListener('change', (e) => {
        if (scannerIsRunning) {
            html5QrCode.stop().then(() => {
                startScanning(e.target.value);
            });
        }
    });

    // ----------------------------------------------------
    // File Upload Scanner Logic
    // ----------------------------------------------------

    // Decode barcodes and QR codes from uploaded image files
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileFeedback.classList.add('d-none');
        
        // Scan the file client-side using html5QrCode library
        html5QrCode.scanFile(file, true)
            .then(decodedText => {
                // Mock decoded result format matching camera output structure
                const decodedResult = {
                    result: {
                        format: {
                            formatName: "QR_CODE"
                        }
                    }
                };
                handleScanSuccess(decodedText, decodedResult);
                
                // Clear file input value to allow scan re-runs
                fileInput.value = '';
            })
            .catch(err => {
                console.error("File decode error:", err);
                fileFeedback.textContent = "Could not find any readable QR code or Barcode in this image.";
                fileFeedback.classList.remove('d-none');
                fileInput.value = '';
            });
    });

    // Switch between Camera and File tabs halts camera stream
    document.getElementById('scannerTab').addEventListener('shown.bs.tab', (e) => {
        if (e.target.id !== 'camera-tab' && scannerIsRunning) {
            stopScanning();
        }
    });
});
