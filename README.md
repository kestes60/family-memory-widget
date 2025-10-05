# 🎙️ Family Memory Widget

A lightweight, embeddable JavaScript widget for recording and transcribing family memories on genealogy websites. Built with vanilla JavaScript, no dependencies required.

## ✨ Features

### Free Tier
- **Audio Recording**: Up to 2 minutes per recording using browser MediaRecorder API
- **Automatic Transcription**: Powered by Faster Whisper API (Railway deployment)
- **Visual Progress Bar**: Horizontal countdown timer (green to red gradient) showing time remaining
- **Language Detection**: Automatic language detection with confidence scores
- **Editable Transcripts**: Clean modal interface for reviewing and editing transcribed text
- **Rate Limiting**: 3 free recordings per day per IP (via localStorage)
- **Copy to Clipboard**: Easy sharing of transcribed memories

### Pro Tier ($5)
- **Extended Recording**: Up to 5 minutes per recording
- **Unlimited Uses**: No daily limits
- **Download Recording**: Save audio as WAV file with timestamp-based filename
- **PDF Export**: Export transcript with metadata, confidence scores, and optional photos
- **Photo Upload**: Attach photos to memories (ready for implementation)

## 🚀 Quick Start

### 1. Embed on Your Website

Add these two lines to your HTML:

```html
<!-- Add this div where you want the widget to appear -->
<div class="family-memory-widget"></div>

<!-- Add this script tag before closing </body> tag -->
<script src="widget.js"></script>
```

That's it! The widget will automatically initialize when the page loads.

### 2. Test Locally

Open `index.html` in your browser to see a demo of the widget in action.

```bash
# If you have Python installed, you can run a local server:
python3 -m http.server 8000

# Then open: http://localhost:8000
```

## 📋 How It Works

1. **User clicks the microphone button** → Widget requests microphone access
2. **Recording starts** → Progress bar shows time remaining (2 min for free users)
3. **User clicks again or time expires** → Recording stops automatically
4. **Audio is sent to API** → Multipart FormData POST to Faster Whisper endpoint
5. **Transcript appears in modal** → User can edit, copy, or save the text

## ⚙️ Configuration

All configuration is in the `CONFIG` object at the top of `widget.js`:

```javascript
const CONFIG = {
  // Your Faster Whisper API endpoint
  API_URL: 'https://faster-whisper-api-production-537b.up.railway.app/transcribe-audio',
  
  // Time limits (seconds)
  FREE_TIME_LIMIT: 120,  // 2 minutes for free users
  PRO_TIME_LIMIT: 300,   // 5 minutes for pro users
  
  // Rate limiting
  FREE_DAILY_LIMIT: 3,   // 3 recordings per day
  
  // Stripe checkout for upgrades
  STRIPE_CHECKOUT_URL: 'https://buy.stripe.com/test_YOUR_STRIPE_LINK',
  PRO_PRICE: 5
};
```

### Customization Options

- **Change time limits**: Modify `FREE_TIME_LIMIT` and `PRO_TIME_LIMIT`
- **Adjust rate limits**: Change `FREE_DAILY_LIMIT`
- **Update API endpoint**: Point to your own transcription service
- **Customize styling**: Edit CSS classes in the `injectStyles()` function
- **Add Stripe integration**: Replace `STRIPE_CHECKOUT_URL` with your checkout link

## 💳 Pro Upgrade Integration

### Activating Pro Access

After a successful Stripe payment, set the Pro flag in localStorage:

```javascript
localStorage.setItem('familyMemory_pro', 'true');
```

You can do this via a webhook or redirect page after payment completion.

### Recommended Flow

1. User clicks "Upgrade to Pro" link in modal
2. Redirected to Stripe Checkout
3. After successful payment → Redirect to success page
4. Success page sets `localStorage.setItem('familyMemory_pro', 'true')`
5. User returns to your site with Pro features unlocked

### Testing Pro Features

The demo `index.html` includes a toggle switch to test Pro features:

1. Open `index.html` in your browser
2. Toggle the "Pro Mode" switch at the top
3. Record a new audio memory
4. In the transcript modal, you'll see:
   - **Download Recording** button (saves as `family-memory-[timestamp].wav`)
   - **Export PDF** button (creates formatted PDF with transcript & metadata)

**Note**: Make sure jsPDF library is loaded for PDF export to work:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
```

## 🔧 Technical Details

### Browser Compatibility

- **Requires HTTPS**: MediaRecorder API only works on secure connections (or localhost)
- **Modern browsers**: Chrome 49+, Firefox 25+, Safari 14+, Edge 79+
- **Mobile friendly**: Works on iOS Safari and Chrome for Android

### API Integration

The widget sends audio as multipart/form-data:

```javascript
POST /transcribe-audio
Content-Type: multipart/form-data

file: (audio blob) - The recorded audio file
// Pro users can also send:
photo: (image blob) - Optional photo attachment
```

Expected API response:

```json
{
  "transcript": "The transcribed text here...",
  "language": "en",
  "language_probability": 0.95
}
```

### Audio Format

- Default: WebM with Opus codec (best browser support)
- Fallback: WebM with available codec
- Sample rate: 44.1 kHz
- Enhancements: Echo cancellation and noise suppression enabled

### Data Storage

- **Rate limiting**: Stored in browser localStorage (key: `familyMemory_usage`)
- **Pro status**: Stored in browser localStorage (key: `familyMemory_pro`)
- **No server-side storage**: All data is ephemeral (transcription only)

## 📱 Usage Examples

### Basic Embed

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Genealogy Site</title>
</head>
<body>
  <h1>Record Your Family Story</h1>
  
  <div class="family-memory-widget"></div>
  
  <script src="widget.js"></script>
</body>
</html>
```

### Multiple Widgets on One Page

```html
<div class="family-memory-widget"></div>
<!-- Widget for grandmother's memories -->

<div class="family-memory-widget"></div>
<!-- Widget for grandfather's memories -->

<script src="widget.js"></script>
```

### Manual Initialization

```html
<div class="family-memory-widget"></div>

<script src="widget.js"></script>
<script>
  // Widget auto-initializes by default
  // But you can also manually control it:
  
  // Re-initialize if needed
  window.FamilyMemoryWidget.init();
  
  // Check version
  console.log(window.FamilyMemoryWidget.version);
</script>
```

## 🎨 Styling

The widget injects its own styles automatically. All classes are prefixed with `fm-` to avoid conflicts:

- `.fm-widget-container` - Main container
- `.fm-mic-button` - Microphone button
- `.fm-progress-container` - Progress bar container
- `.fm-modal-overlay` - Modal backdrop
- `.fm-modal` - Modal content

You can override these styles in your own CSS:

```css
/* Make the mic button bigger */
.fm-mic-button {
  width: 80px !important;
  height: 80px !important;
}

/* Change the color scheme */
.fm-mic-button {
  background: linear-gradient(135deg, #your-color-1, #your-color-2) !important;
}
```

## 🐛 Troubleshooting

### Microphone Not Working

- **Check HTTPS**: The MediaRecorder API requires a secure connection (https:// or localhost)
- **Check permissions**: User must grant microphone access in browser
- **Check browser support**: Use a modern browser (Chrome, Firefox, Safari, Edge)

### Transcription Fails

- **Check API URL**: Verify the endpoint is correct in `CONFIG.API_URL`
- **Check network**: Open browser DevTools → Network tab to see API requests
- **Check API response**: API must return JSON with `transcript` field

### Rate Limit Issues

- **Clear localStorage**: Run `localStorage.clear()` in browser console
- **Check date**: Rate limit resets daily (stored date in localStorage)

### Modal Not Appearing

- **Check z-index**: Modal uses z-index: 10000 (may conflict with other elements)
- **Check console**: Look for JavaScript errors in browser DevTools

## 📊 File Structure

```
family-memory-widget/
├── widget.js           # Main widget code (self-contained)
├── index.html          # Demo page showing widget in action
├── README.md           # This file
└── Chat_with_Claude.md # Original requirements
```

## 🔒 Security & Privacy

- **No data persistence**: Audio and transcripts are not stored on the server
- **Client-side rate limiting**: Easy to bypass, consider server-side for production
- **Microphone access**: Requires explicit user permission
- **HTTPS required**: Ensures encrypted data transmission

## 🎯 Pro Features Implemented

### Download Recording
When Pro mode is enabled, users can download their audio recordings:
- Saves as WAV format blob (actually the recorded format, typically WebM)
- Filename: `family-memory-[timestamp].wav` (e.g., `family-memory-2025-10-05T14-30-15.wav`)
- Includes visual feedback (button changes to "✅ Downloaded!")
- Free users see disabled button with tooltip prompting upgrade

### Export PDF
Pro users can export transcripts as formatted PDF documents:
- Uses jsPDF library (loaded via CDN)
- Includes: Title, timestamp, language, confidence score, duration, and full transcript
- Supports pagination for long transcripts
- Ready for photo attachments (when photo upload is implemented)
- Filename: `family-memory-[date].pdf` (e.g., `family-memory-2025-10-05.pdf`)
- Professional layout with proper formatting and footer

## 🚧 Future Enhancements

Additional features ready to implement:

1. **Photo Upload**: Add file input to modal, append to FormData as `photo`
2. **Server-side rate limiting**: Track by IP or user account (currently client-side only)
3. **Authentication**: Integrate with your user system for persistent Pro status
4. **Cloud Storage**: Store transcripts and recordings in database
5. **Sharing**: Generate shareable links to memories
6. **Timestamps**: Add word-level timestamps to transcripts (if API supports it)

## 📄 License

Free to use and modify for your genealogy projects.

## 🤝 Support

For issues or questions:
1. Check this README first
2. Look at browser console for errors
3. Test with the demo `index.html` file
4. Verify API endpoint is accessible

## 🙏 Credits

- **Faster Whisper API**: Transcription service on Railway
- **MediaRecorder API**: Browser native recording
- **Built with**: Vanilla JavaScript (no dependencies!)

---

**Version**: 1.0.0  
**Last Updated**: October 2025

