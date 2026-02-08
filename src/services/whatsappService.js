const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const WHATSAPP_API_BASE = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}`;

/**
 * Send a text message to a WhatsApp user.
 */
async function sendTextMessage(to, text) {
  try {
    // WhatsApp has a ~4096 character limit per text message.
    // If the message is longer, split it.
    const chunks = splitMessage(text, 4000);

    for (const chunk of chunks) {
      await axios.post(
        `${WHATSAPP_API_BASE}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: {
            preview_url: false,
            body: chunk,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${env.whatsapp.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    logger.info('WhatsApp message sent', { to, chunksCount: chunks.length });
  } catch (error) {
    const errData = error.response?.data || error.message;
    logger.error('Failed to send WhatsApp message', { to, error: errData });
    throw new Error('WhatsApp send failed');
  }
}

/**
 * Mark a message as read (blue ticks).
 */
async function markAsRead(messageId) {
  try {
    await axios.post(
      `${WHATSAPP_API_BASE}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    // Non-critical – log and move on
    logger.warn('Failed to mark message as read', { messageId });
  }
}

/**
 * Split a long message into chunks at line boundaries.
 */
function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find last newline before maxLength
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      // Fall back to space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

module.exports = {
  sendTextMessage,
  markAsRead,
};