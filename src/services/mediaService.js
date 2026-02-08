const axios = require('axios');
const FormData = require('form-data');
const env = require('../config/env');
const logger = require('../utils/logger');

async function downloadMedia(mediaId) {
  try {
    const urlRes = await axios.get(
      `https://graph.facebook.com/${env.whatsapp.apiVersion}/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
      }
    );
    const mediaUrl = urlRes.data.url;

    const binaryRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
    });

    return binaryRes.data;
  } catch (error) {
    logger.error('Media download failed', {
      error: error.response?.data || error.message,
    });
    return null;
  }
}

async function transcribeAudio(audioBuffer) {
  try {
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'voice_note.ogg',
      contentType: 'audio/ogg',
    });
    form.append('model', 'whisper-large-v3');

    const resp = await axios.post(
      `${env.openai.baseUrl}/audio/transcriptions`,
      form,
      {
        headers: {
          Authorization: `Bearer ${env.openai.apiKey}`,
          ...form.getHeaders(),
        },
      }
    );

    return resp.data.text;
  } catch (error) {
    logger.error('Audio transcription failed', {
      error: error.response?.data || error.message,
    });
    return null;
  }
}

function cleanJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

// Read bill/receipt image and convert to "Spent X on Y"
async function analyzeBillWithVision(imageBuffer) {
  const base64 = imageBuffer.toString('base64');

  // Try JSON mode first
  try {
    const resp = await axios.post(
      `${env.openai.baseUrl}/chat/completions`,
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.1,
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'You are an OCR expert for Indian bills/receipts. ' +
                  'Return JSON: { "amount": number, "item": string } ' +
                  'amount = total paid in rupees (no currency sign), item = short label like "Pizza", "Groceries", "Taxi".',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${env.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let raw = (resp.data.choices?.[0]?.message?.content || '').trim();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      json = JSON.parse(cleanJSON(raw));
    }

    if (json && typeof json.amount === 'number' && json.item) {
      const amount = Math.round(json.amount);
      const item = String(json.item).trim() || 'purchase';
      return `Spent ${amount} on ${item}`;
    }
  } catch (error) {
    logger.warn('Vision JSON mode failed', {
      error: error.response?.data || error.message,
    });
  }

  // Fallback simple text mode
  try {
    const resp2 = await axios.post(
      `${env.openai.baseUrl}/chat/completions`,
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.1,
        max_tokens: 128,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Look at this Indian bill or receipt and answer in EXACTLY one sentence:\n' +
                  'Spent <amount> on <item>\n' +
                  'Example: Spent 790 on Pizza\n' +
                  'No extra words, no currency symbols, only that sentence.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${env.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const raw2 = (resp2.data.choices?.[0]?.message?.content || '').trim();
    const match = raw2.match(/spent\s+([\d,.]+)\s+on\s+(.+)/i);
    if (match) {
      const amtStr = match[1].replace(/,/g, '');
      const amount = Math.round(parseFloat(amtStr));
      const item = match[2].replace(/[\s.]+$/, '') || 'purchase';
      return `Spent ${amount} on ${item}`;
    }
  } catch (error) {
    logger.error('Vision text mode failed', {
      error: error.response?.data || error.message,
    });
  }

  return null;
}

module.exports = {
  downloadMedia,
  transcribeAudio,
  analyzeBillWithVision,
};