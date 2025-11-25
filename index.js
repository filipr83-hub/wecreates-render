import express from 'express';
import { Canvas, loadImage } from 'skia-canvas';
import https from 'https';
import http from 'http';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Helper function to download image from URL
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });
    }).on('error', reject);
  });
}

// Helper function to wrap text
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

// POST /render-slide endpoint
app.post('/render-slide', async (req, res) => {
  try {
    const { backgroundUrl, title, text } = req.body;

    // Validate required fields
    if (!title || !text) {
      return res.status(400).json({ 
        error: 'Missing required fields. Both "title" and "text" are required.' 
      });
    }

    // Canvas dimensions for Instagram carousel
    const WIDTH = 1080;
    const HEIGHT = 1350;
    const canvas = new Canvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load and draw background image
    let backgroundImage;
    try {
      if (backgroundUrl) {
        const imageBuffer = await downloadImage(backgroundUrl);
        backgroundImage = await loadImage(imageBuffer);
      }
    } catch (error) {
      console.error('Failed to load background image:', error.message);
      // Will use fallback background
    }

    if (backgroundImage) {
      // Calculate scaling to fill the canvas while maintaining aspect ratio
      const scale = Math.max(WIDTH / backgroundImage.width, HEIGHT / backgroundImage.height);
      const scaledWidth = backgroundImage.width * scale;
      const scaledHeight = backgroundImage.height * scale;
      
      // Center the image
      const x = (WIDTH - scaledWidth) / 2;
      const y = (HEIGHT - scaledHeight) / 2;
      
      ctx.drawImage(backgroundImage, x, y, scaledWidth, scaledHeight);
    } else {
      // Fallback: dark background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Draw semi-transparent black overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Set up title text styling
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.textBaseline = 'top';

    // Draw title with line wrapping
    const titlePadding = 120;
    const maxTitleWidth = WIDTH - (titlePadding * 2);
    const titleLines = wrapText(ctx, title, maxTitleWidth);
    
    let yPosition = 120; // Start position from top
    titleLines.forEach((line) => {
      ctx.fillText(line, titlePadding, yPosition);
      yPosition += 90; // Line height for title (72px font + spacing)
    });

    // Add spacing between title and body text
    yPosition += 40;

    // Set up body text styling
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '44px sans-serif';
    
    // Draw body text with line wrapping and spacing
    const bodyLines = wrapText(ctx, text, maxTitleWidth);
    const lineHeight = 44 * 1.3; // 1.3 line spacing
    
    bodyLines.forEach((line) => {
      ctx.fillText(line, titlePadding, yPosition);
      yPosition += lineHeight;
    });

    // Convert canvas to PNG buffer
    const pngBuffer = await canvas.toBuffer('png');
    
    // Convert to base64
    const base64Image = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    // Return JSON response
    res.json({
      imageBase64: base64Image
    });

  } catch (error) {
    console.error('Error rendering slide:', error);
    res.status(500).json({ 
      error: 'Internal server error while rendering slide' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
