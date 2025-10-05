/**
 * Family Memory Widget - Embeddable Audio Recording Widget
 * A lightweight JavaScript widget for recording and transcribing family memories
 * on genealogy websites.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // API endpoint for transcription service (Faster Whisper on Railway)
    API_URL: 'https://faster-whisper-api-production-537b.up.railway.app/transcribe-audio',
    
    // Time limits (in seconds)
    FREE_TIME_LIMIT: 120,  // 2 minutes for free users
    PRO_TIME_LIMIT: 300,   // 5 minutes for pro users
    
    // Rate limiting (free users only)
    FREE_DAILY_LIMIT: 3,   // 3 recordings per day for free users
    
    // Stripe checkout for Pro upgrade
    STRIPE_CHECKOUT_URL: 'https://buy.stripe.com/test_YOUR_STRIPE_LINK',
    PRO_PRICE: 5  // $5 for Pro upgrade
  };

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  let widgetState = {
    isRecording: false,
    isPro: false,  // Check if user has Pro access
    mediaRecorder: null,
    audioChunks: [],
    audioBlob: null,  // Store the recorded audio blob for download
    startTime: null,
    timerInterval: null,
    recordingDuration: 0,
    currentTranscript: null,  // Store current transcript data
    uploadedPhoto: null  // Store uploaded photo for PDF export
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Format seconds into MM:SS format for display
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Check localStorage for rate limiting (free users only)
   * Returns: { canRecord: boolean, usesLeft: number }
   */
  function checkRateLimit() {
    if (widgetState.isPro) {
      return { canRecord: true, usesLeft: Infinity };
    }

    const today = new Date().toDateString();
    const storageKey = 'familyMemory_usage';
    
    try {
      const stored = localStorage.getItem(storageKey);
      const usage = stored ? JSON.parse(stored) : {};

      // Reset counter if it's a new day
      if (usage.date !== today) {
        usage.date = today;
        usage.count = 0;
      }

      const usesLeft = CONFIG.FREE_DAILY_LIMIT - usage.count;
      const canRecord = usage.count < CONFIG.FREE_DAILY_LIMIT;

      return { canRecord, usesLeft };
    } catch (e) {
      // If localStorage fails, allow recording but warn
      console.warn('localStorage not available:', e);
      return { canRecord: true, usesLeft: 1 };
    }
  }

  /**
   * Increment the usage counter in localStorage
   */
  function incrementUsageCount() {
    if (widgetState.isPro) return;

    const today = new Date().toDateString();
    const storageKey = 'familyMemory_usage';
    
    try {
      const stored = localStorage.getItem(storageKey);
      const usage = stored ? JSON.parse(stored) : {};

      if (usage.date !== today) {
        usage.date = today;
        usage.count = 0;
      }

      usage.count = (usage.count || 0) + 1;
      localStorage.setItem(storageKey, JSON.stringify(usage));
    } catch (e) {
      console.warn('Could not update usage count:', e);
    }
  }

  /**
   * Convert audio blob to WAV format
   * For simplicity, we'll send the recorded blob directly.
   * The MediaRecorder will use the best available format.
   */
  function convertToWAV(blob) {
    // In a production app, you might want to convert to WAV format here
    // For now, we'll rely on the MediaRecorder's output
    return blob;
  }

  // ============================================================================
  // UI CREATION
  // ============================================================================

  /**
   * Inject CSS styles into the page
   */
  function injectStyles() {
    const styleId = 'family-memory-widget-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Widget container */
      .fm-widget-container {
        display: inline-block;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      /* Microphone button */
      .fm-mic-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        border-radius: 50%;
        width: 64px;
        height: 64px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .fm-mic-button:hover:not(:disabled) {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
      }

      .fm-mic-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .fm-mic-button.recording {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        animation: pulse 1.5s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }

      /* Microphone icon */
      .fm-mic-icon {
        width: 28px;
        height: 28px;
        fill: white;
      }

      /* Progress bar container (shown during recording) */
      .fm-progress-container {
        position: absolute;
        bottom: -40px;
        left: 50%;
        transform: translateX(-50%);
        width: 200px;
        background: white;
        border-radius: 8px;
        padding: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        display: none;
      }

      .fm-progress-container.active {
        display: block;
      }

      /* Progress bar */
      .fm-progress-bar {
        width: 100%;
        height: 24px;
        background: linear-gradient(90deg, #10b981 0%, #ef4444 100%);
        border-radius: 4px;
        position: relative;
        overflow: hidden;
      }

      .fm-progress-fill {
        height: 100%;
        background: rgba(255, 255, 255, 0.3);
        transition: width 0.3s linear;
        position: absolute;
        right: 0;
      }

      /* Time remaining text */
      .fm-time-remaining {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-weight: 600;
        font-size: 12px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }

      /* Modal overlay */
      .fm-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .fm-modal-overlay.active {
        display: flex;
      }

      /* Modal content */
      .fm-modal {
        background: white;
        border-radius: 12px;
        padding: 32px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }

      .fm-modal h2 {
        margin: 0 0 16px 0;
        color: #1f2937;
        font-size: 24px;
      }

      /* Transcript editor */
      .fm-transcript-editor {
        width: 100%;
        min-height: 150px;
        padding: 12px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 16px;
        line-height: 1.6;
        resize: vertical;
        font-family: inherit;
        margin-bottom: 16px;
      }

      .fm-transcript-editor:focus {
        outline: none;
        border-color: #667eea;
      }

      /* Metadata display */
      .fm-metadata {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        padding: 12px;
        background: #f9fafb;
        border-radius: 8px;
        font-size: 14px;
      }

      .fm-metadata-item {
        display: flex;
        flex-direction: column;
      }

      .fm-metadata-label {
        color: #6b7280;
        font-size: 12px;
        margin-bottom: 4px;
      }

      .fm-metadata-value {
        color: #1f2937;
        font-weight: 600;
      }

      /* Buttons */
      .fm-button-group {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .fm-button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .fm-button-primary {
        background: #667eea;
        color: white;
      }

      .fm-button-primary:hover {
        background: #5568d3;
      }

      .fm-button-secondary {
        background: #e5e7eb;
        color: #1f2937;
      }

      .fm-button-secondary:hover {
        background: #d1d5db;
      }

      .fm-button-disabled {
        opacity: 0.5;
        cursor: not-allowed !important;
      }

      .fm-button-disabled:hover {
        background: #e5e7eb !important;
      }

      /* Pro upgrade hint */
      .fm-pro-hint {
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        color: #78350f;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 14px;
        line-height: 1.5;
      }

      .fm-pro-hint strong {
        display: block;
        margin-bottom: 4px;
      }

      .fm-upgrade-link {
        color: #78350f;
        text-decoration: underline;
        font-weight: 600;
      }

      /* Loading spinner */
      .fm-loading {
        text-align: center;
        padding: 32px;
      }

      .fm-spinner {
        border: 3px solid #f3f4f6;
        border-top: 3px solid #667eea;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Error message */
      .fm-error {
        background: #fee2e2;
        color: #991b1b;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 14px;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Create the main widget HTML structure
   */
  function createWidgetHTML() {
    const container = document.createElement('div');
    container.className = 'fm-widget-container';
    container.innerHTML = `
      <button class="fm-mic-button" id="fm-mic-button" title="Record Memory">
        <svg class="fm-mic-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      </button>
      <div class="fm-progress-container" id="fm-progress-container">
        <div class="fm-progress-bar">
          <div class="fm-progress-fill" id="fm-progress-fill"></div>
          <div class="fm-time-remaining" id="fm-time-remaining">2:00 left</div>
        </div>
      </div>
    `;

    return container;
  }

  /**
   * Create the modal for displaying transcript
   */
  function createModalHTML() {
    const modal = document.createElement('div');
    modal.className = 'fm-modal-overlay';
    modal.id = 'fm-modal-overlay';
    modal.innerHTML = `
      <div class="fm-modal" id="fm-modal">
        <!-- Content will be dynamically inserted here -->
      </div>
    `;

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    return modal;
  }

  // ============================================================================
  // RECORDING FUNCTIONALITY
  // ============================================================================

  /**
   * Start audio recording
   */
  async function startRecording() {
    // Check rate limit first
    const { canRecord, usesLeft } = checkRateLimit();
    
    if (!canRecord) {
      showUpgradeModal('Daily limit reached', 
        `You've used all ${CONFIG.FREE_DAILY_LIMIT} free recordings today. Upgrade to Pro for unlimited recordings!`);
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });

      // Determine recording format (prefer webm with opus, fallback to available)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';

      // Create MediaRecorder instance
      widgetState.mediaRecorder = new MediaRecorder(stream, { mimeType });
      widgetState.audioChunks = [];

      // Collect audio data
      widgetState.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          widgetState.audioChunks.push(event.data);
        }
      };

      // Handle recording completion
      widgetState.mediaRecorder.onstop = () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Create blob from chunks
        const audioBlob = new Blob(widgetState.audioChunks, { type: mimeType });
        
        // Store the audio blob for later download
        widgetState.audioBlob = audioBlob;
        
        // Send to transcription API
        sendToAPI(audioBlob);
        
        // Increment usage count
        incrementUsageCount();
      };

      // Start recording
      widgetState.mediaRecorder.start();
      widgetState.isRecording = true;
      widgetState.startTime = Date.now();
      widgetState.recordingDuration = 0;

      // Update UI
      updateRecordingUI(true);

      // Start timer
      startTimer();

    } catch (error) {
      console.error('Error starting recording:', error);
      showError('Could not access microphone. Please check your permissions and try again.');
    }
  }

  /**
   * Stop audio recording
   */
  function stopRecording() {
    if (widgetState.mediaRecorder && widgetState.isRecording) {
      widgetState.mediaRecorder.stop();
      widgetState.isRecording = false;

      // Stop timer
      if (widgetState.timerInterval) {
        clearInterval(widgetState.timerInterval);
        widgetState.timerInterval = null;
      }

      // Update UI
      updateRecordingUI(false);
    }
  }

  /**
   * Start the recording timer and progress bar
   */
  function startTimer() {
    const maxTime = widgetState.isPro ? CONFIG.PRO_TIME_LIMIT : CONFIG.FREE_TIME_LIMIT;

    widgetState.timerInterval = setInterval(() => {
      widgetState.recordingDuration++;

      // Calculate time remaining
      const timeRemaining = maxTime - widgetState.recordingDuration;
      
      // Update progress bar
      updateProgressBar(widgetState.recordingDuration, maxTime);

      // Auto-stop when time limit reached
      if (timeRemaining <= 0) {
        stopRecording();
      }
    }, 1000);
  }

  /**
   * Update progress bar display
   */
  function updateProgressBar(current, max) {
    const progressFill = document.getElementById('fm-progress-fill');
    const timeRemaining = document.getElementById('fm-time-remaining');

    if (progressFill && timeRemaining) {
      const remaining = max - current;
      const percentage = (remaining / max) * 100;
      
      progressFill.style.width = `${percentage}%`;
      timeRemaining.textContent = `${formatTime(remaining)} left`;
    }
  }

  /**
   * Update UI to reflect recording state
   */
  function updateRecordingUI(isRecording) {
    const button = document.getElementById('fm-mic-button');
    const progressContainer = document.getElementById('fm-progress-container');

    if (button) {
      if (isRecording) {
        button.classList.add('recording');
        button.title = 'Stop Recording';
      } else {
        button.classList.remove('recording');
        button.title = 'Record Memory';
      }
    }

    if (progressContainer) {
      if (isRecording) {
        progressContainer.classList.add('active');
      } else {
        progressContainer.classList.remove('active');
      }
    }
  }

  // ============================================================================
  // API COMMUNICATION
  // ============================================================================

  /**
   * Send audio blob to transcription API
   */
  async function sendToAPI(audioBlob) {
    // Show loading modal
    showLoadingModal();

    try {
      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      // For Pro users, we could add photo upload here
      // formData.append('photo', photoBlob, 'photo.jpg');

      // Send to API
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Display transcript in modal
      showTranscriptModal(result);

    } catch (error) {
      console.error('Error sending to API:', error);
      showError('Failed to transcribe audio. Please try again. Error: ' + error.message);
    }
  }

  // ============================================================================
  // MODAL DISPLAY
  // ============================================================================

  /**
   * Show loading spinner while waiting for transcription
   */
  function showLoadingModal() {
    const modal = document.getElementById('fm-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fm-loading">
        <div class="fm-spinner"></div>
        <p>Transcribing your memory...</p>
      </div>
    `;

    openModal();
  }

  /**
   * Show transcript results in modal
   */
  function showTranscriptModal(data) {
    const modal = document.getElementById('fm-modal');
    if (!modal) return;

    const { transcript, language, language_probability } = data;
    const confidence = language_probability ? (language_probability * 100).toFixed(1) : 'N/A';

    // Store transcript data for later use
    widgetState.currentTranscript = {
      transcript,
      language,
      language_probability,
      confidence
    };

    // Show Pro upgrade hint for free users
    const proHint = !widgetState.isPro ? `
      <div class="fm-pro-hint">
        <strong>💡 Upgrade to Pro for $${CONFIG.PRO_PRICE}</strong>
        Get unlimited recording time, photo uploads, PDF export with timestamps, and audio downloads.
        <a href="${CONFIG.STRIPE_CHECKOUT_URL}" target="_blank" class="fm-upgrade-link">Upgrade Now</a>
      </div>
    ` : '';

    // Download Recording button - disabled for free tier with tooltip
    const downloadButton = widgetState.isPro 
      ? `<button class="fm-button fm-button-secondary" id="fm-download-button">📥 Download Recording</button>`
      : `<button class="fm-button fm-button-secondary fm-button-disabled" id="fm-download-button" title="Upgrade to Pro to download recordings">📥 Download Recording (Pro)</button>`;

    // Export PDF button - only for Pro tier
    const exportButton = widgetState.isPro 
      ? `<button class="fm-button fm-button-secondary" id="fm-export-button">📄 Export PDF</button>`
      : '';

    modal.innerHTML = `
      <h2>Your Family Memory</h2>
      
      ${proHint}

      <textarea class="fm-transcript-editor" id="fm-transcript-text">${transcript || ''}</textarea>
      
      <div class="fm-metadata">
        <div class="fm-metadata-item">
          <span class="fm-metadata-label">Detected Language</span>
          <span class="fm-metadata-value">${language || 'Unknown'}</span>
        </div>
        <div class="fm-metadata-item">
          <span class="fm-metadata-label">Confidence</span>
          <span class="fm-metadata-value">${confidence}%</span>
        </div>
        <div class="fm-metadata-item">
          <span class="fm-metadata-label">Duration</span>
          <span class="fm-metadata-value">${formatTime(widgetState.recordingDuration)}</span>
        </div>
      </div>

      <div class="fm-button-group">
        <button class="fm-button fm-button-secondary" id="fm-close-button">Close</button>
        ${downloadButton}
        ${exportButton}
        <button class="fm-button fm-button-primary" id="fm-copy-button">Copy Text</button>
      </div>
    `;

    // Attach event listeners
    document.getElementById('fm-close-button').addEventListener('click', closeModal);
    document.getElementById('fm-copy-button').addEventListener('click', copyTranscript);
    
    // Download Recording button (only functional for Pro users)
    const downloadBtn = document.getElementById('fm-download-button');
    if (downloadBtn) {
      if (widgetState.isPro) {
        downloadBtn.addEventListener('click', downloadRecording);
      } else {
        // For free users, show upgrade modal on click
        downloadBtn.addEventListener('click', () => {
          showUpgradeModal('Pro Feature: Download Recording', 
            'Download your audio recordings as WAV files. This feature is available with Pro upgrade.');
        });
      }
    }

    // Export PDF button (Pro only)
    const exportBtn = document.getElementById('fm-export-button');
    if (exportBtn && widgetState.isPro) {
      exportBtn.addEventListener('click', exportPDF);
    }

    openModal();
  }

  /**
   * Show Pro upgrade modal
   */
  function showUpgradeModal(title, message) {
    const modal = document.getElementById('fm-modal');
    if (!modal) return;

    modal.innerHTML = `
      <h2>${title}</h2>
      
      <div class="fm-pro-hint">
        <strong>Upgrade to Pro - Only $${CONFIG.PRO_PRICE}</strong>
        <p>${message}</p>
        <p>Pro features include:</p>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>Unlimited recording time (up to 5 minutes)</li>
          <li>No daily limits</li>
          <li>Photo upload capability</li>
          <li>PDF export with timestamps</li>
        </ul>
        <a href="${CONFIG.STRIPE_CHECKOUT_URL}" target="_blank" class="fm-upgrade-link">Upgrade Now</a>
      </div>

      <div class="fm-button-group">
        <button class="fm-button fm-button-secondary" id="fm-close-button">Close</button>
      </div>
    `;

    document.getElementById('fm-close-button').addEventListener('click', closeModal);

    openModal();
  }

  /**
   * Show error message
   */
  function showError(message) {
    const modal = document.getElementById('fm-modal');
    if (!modal) return;

    modal.innerHTML = `
      <h2>Error</h2>
      <div class="fm-error">${message}</div>
      <div class="fm-button-group">
        <button class="fm-button fm-button-secondary" id="fm-close-button">Close</button>
      </div>
    `;

    document.getElementById('fm-close-button').addEventListener('click', closeModal);

    openModal();
  }

  /**
   * Open modal overlay
   */
  function openModal() {
    const overlay = document.getElementById('fm-modal-overlay');
    if (overlay) {
      overlay.classList.add('active');
    }
  }

  /**
   * Close modal overlay
   */
  function closeModal() {
    const overlay = document.getElementById('fm-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  }

  /**
   * Copy transcript text to clipboard
   */
  function copyTranscript() {
    const textArea = document.getElementById('fm-transcript-text');
    if (textArea) {
      textArea.select();
      document.execCommand('copy');
      
      // Visual feedback
      const button = document.getElementById('fm-copy-button');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    }
  }

  /**
   * Download the recorded audio as a WAV file (Pro feature)
   * Creates a download link with timestamp-based filename
   */
  function downloadRecording() {
    if (!widgetState.isPro) {
      showUpgradeModal('Pro Feature Required', 
        'Download your audio recordings as WAV files with Pro upgrade.');
      return;
    }

    if (!widgetState.audioBlob) {
      showError('No audio recording available to download.');
      return;
    }

    try {
      // Generate timestamp for filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `family-memory-${timestamp}.wav`;

      // Create download link
      const url = URL.createObjectURL(widgetState.audioBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Visual feedback
      const button = document.getElementById('fm-download-button');
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ Downloaded!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error('Error downloading recording:', error);
      showError('Failed to download recording. Please try again.');
    }
  }

  /**
   * Export transcript and metadata to PDF (Pro feature)
   * Uses jsPDF library to create a formatted PDF document
   */
  function exportPDF() {
    if (!widgetState.isPro) {
      showUpgradeModal('Pro Feature Required', 
        'Export your transcripts to PDF with Pro upgrade.');
      return;
    }

    // Check if jsPDF is loaded
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      showError('PDF export library not loaded. Please include jsPDF library in your page.');
      console.error('jsPDF library not found. Add: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>');
      return;
    }

    try {
      // Get the jsPDF constructor (handle both module formats)
      const { jsPDF } = window.jspdf || window;
      
      if (!jsPDF) {
        throw new Error('jsPDF constructor not available');
      }

      // Get current transcript text (including any edits)
      const textArea = document.getElementById('fm-transcript-text');
      const transcript = textArea ? textArea.value : widgetState.currentTranscript?.transcript || '';

      // Create new PDF document
      const doc = new jsPDF();

      // Set up styling
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - (margin * 2);
      let yPosition = 20;

      // Title
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('Family Memory Transcript', margin, yPosition);
      yPosition += 15;

      // Metadata section
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      
      const timestamp = new Date().toLocaleString();
      doc.text(`Date: ${timestamp}`, margin, yPosition);
      yPosition += 6;

      if (widgetState.currentTranscript) {
        doc.text(`Language: ${widgetState.currentTranscript.language || 'Unknown'}`, margin, yPosition);
        yPosition += 6;
        doc.text(`Confidence: ${widgetState.currentTranscript.confidence}%`, margin, yPosition);
        yPosition += 6;
      }

      doc.text(`Duration: ${formatTime(widgetState.recordingDuration)}`, margin, yPosition);
      yPosition += 15;

      // Transcript section
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Transcript:', margin, yPosition);
      yPosition += 8;

      // Transcript text (wrapped)
      doc.setFont(undefined, 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(transcript, maxWidth);
      
      // Handle pagination if transcript is long
      lines.forEach((line) => {
        if (yPosition > 270) {  // Near bottom of page
          doc.addPage();
          yPosition = 20;
        }
        doc.text(line, margin, yPosition);
        yPosition += 7;
      });

      // Add photo if available (Pro feature placeholder)
      if (widgetState.uploadedPhoto) {
        // Add new page for photo
        doc.addPage();
        yPosition = 20;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Attached Photo:', margin, yPosition);
        yPosition += 10;
        
        // Add photo (jsPDF supports base64 images)
        try {
          doc.addImage(widgetState.uploadedPhoto, 'JPEG', margin, yPosition, maxWidth, 0);
        } catch (e) {
          console.warn('Could not add photo to PDF:', e);
        }
      }

      // Footer on last page
      const pageCount = doc.internal.getNumberOfPages();
      doc.setPage(pageCount);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Generated by Family Memory Widget', margin, 285);

      // Save the PDF
      const pdfFilename = `family-memory-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(pdfFilename);

      // Visual feedback
      const button = document.getElementById('fm-export-button');
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ Exported!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }

    } catch (error) {
      console.error('Error exporting PDF:', error);
      showError('Failed to export PDF. Please make sure jsPDF library is loaded. Error: ' + error.message);
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the widget
   */
  function init() {
    // Inject styles
    injectStyles();

    // Create widget HTML
    const widget = createWidgetHTML();
    const modal = createModalHTML();

    // Find all elements with class 'family-memory-widget' and insert widget
    const containers = document.querySelectorAll('.family-memory-widget');
    
    if (containers.length === 0) {
      console.warn('No elements with class "family-memory-widget" found. Please add <div class="family-memory-widget"></div> to your page.');
      return;
    }

    containers.forEach(container => {
      container.appendChild(widget.cloneNode(true));
    });

    // Add modal to body (only once)
    document.body.appendChild(modal);

    // Attach event listener to mic button(s)
    document.querySelectorAll('#fm-mic-button').forEach(button => {
      button.addEventListener('click', () => {
        if (widgetState.isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      });
    });

    // Check for Pro status (you could check this via API or localStorage)
    // For now, it defaults to false
    widgetState.isPro = localStorage.getItem('familyMemory_pro') === 'true';

    console.log('Family Memory Widget initialized successfully!');
  }

  // ============================================================================
  // AUTO-INITIALIZE
  // ============================================================================

  // Wait for DOM to be ready, then initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose public API for manual initialization if needed
  window.FamilyMemoryWidget = {
    init: init,
    version: '1.0.0'
  };

})();

