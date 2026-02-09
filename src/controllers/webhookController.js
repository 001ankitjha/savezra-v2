const env = require('../config/env');
const logger = require('../utils/logger');
const whatsappService = require('../services/whatsappService');
const userService = require('../services/userService');
const aiService = require('../services/aiService');
const actionDispatcher = require('../services/actionDispatcher');
const mediaService = require('../services/mediaService'); // audio + vision
const { buildSavingsImpactFromText } = require('../utils/planner');
const {
  computeMonthlyHealth,
  buildHealthSummaryText,
} = require('../utils/healthScore');

// In‑flight message set to prevent duplicate processing
const processingMessages = new Set();

/**
 * GET /webhook – WhatsApp verification endpoint
 */
function verify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', { mode, token });
  return res.sendStatus(403);
}

/**
 * POST /webhook – Incoming message handler
 */
async function handleIncoming(req, res) {
  // Always respond 200 quickly to WhatsApp so it doesn't retry
  res.sendStatus(200);

  try {
    const body = req.body;

    if (
      !body ||
      !body.object ||
      !body.entry ||
      !Array.isArray(body.entry) ||
      body.entry.length === 0
    ) {
      return;
    }

    for (const entry of body.entry) {
      if (!entry.changes || !Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value || !value.messages || !Array.isArray(value.messages)) continue;

        for (const message of value.messages) {
          const messageId = message.id;
          const from = message.from;

          if (!from || !messageId) continue;

          // ----- NEW: log who is messaging Savezra -----
          const contact =
            Array.isArray(value.contacts) && value.contacts.length > 0
              ? value.contacts[0]
              : null;
          const name = contact && contact.profile ? contact.profile.name : null;

          let textPreview = null;
          if (message.type === 'text') {
            textPreview = message.text && message.text.body ? message.text.body : null;
          } else if (message.type === 'audio') {
            textPreview = '[audio message]';
          } else if (message.type === 'image') {
            textPreview = '[image message]';
          } else {
            textPreview = `[${message.type} message]`;
          }

          logger.info('Incoming WhatsApp message', {
            from,
            name,
            text: textPreview,
            type: message.type,
            messageId,
          });
          // ---------------------------------------------

          // Deduplicate (WhatsApp can send the same webhook multiple times)
          if (processingMessages.has(messageId)) {
            logger.debug('Duplicate message, skipping', { messageId });
            continue;
          }
          processingMessages.add(messageId);
          setTimeout(() => processingMessages.delete(messageId), 60000);

          // Route based on message type
          routeMessage(message, value).catch((err) => {
            logger.error('Unhandled error in routeMessage', {
              error: err.message,
              stack: err.stack,
            });
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error in handleIncoming', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Route a single incoming message (text, audio, image).
 */
async function routeMessage(message, value) {
  const from = message.from;
  const messageId = message.id;

  if (message.type === 'text') {
    const text = message.text?.body?.trim();
    if (!text) return;
    await processTextInput(from, text, messageId, value);
    return;
  }

  if (message.type === 'audio') {
    // Voice note → download + transcribe → treat as text
    await whatsappService.markAsRead(messageId);

    const audioData = await mediaService.downloadMedia(message.audio.id);
    if (!audioData) {
      await whatsappService.sendTextMessage(
        from,
        "I couldn't download this audio. Please type your message instead."
      );
      return;
    }

    const transcript = await mediaService.transcribeAudio(audioData);
    if (!transcript) {
      await whatsappService.sendTextMessage(
        from,
        "I couldn't clearly understand this voice note. Please type a short line about your money question."
      );
      return;
    }

    await whatsappService.sendTextMessage(from, `You said: "${transcript}"`);
    await processTextInput(from, transcript, messageId, value);
    return;
  }

  if (message.type === 'image') {
    // Bill photo → download + vision → "Spent X on Y" → treat as text
    await whatsappService.markAsRead(messageId);

    const imgData = await mediaService.downloadMedia(message.image.id);
    const caption = message.image?.caption || '';

    if (!imgData) {
      await whatsappService.sendTextMessage(
        from,
        "I couldn't download this image. Please type your expense like: 'Spent 790 on Pizza'."
      );
      return;
    }

    const visionSentence = await mediaService.analyzeBillWithVision(imgData);

    if (visionSentence) {
      await whatsappService.sendTextMessage(
        from,
        `I read your bill as: "${visionSentence}".`
      );
      await processTextInput(from, visionSentence, messageId, value);
      return;
    }

    if (caption) {
      await processTextInput(from, caption, messageId, value);
      return;
    }

    await whatsappService.sendTextMessage(
      from,
      "I couldn't read this bill correctly. Please type a quick line like: 'Spent 790 on Pizza'."
    );
    return;
  }

  logger.debug('Ignoring unsupported message type', { type: message.type });
}

/**
 * Core text-processing pipeline (used by text, audio->text, image->text).
 */
async function processTextInput(from, text, messageId, value) {
  const startTime = Date.now();

  // 1. Mark as read
  await whatsappService.markAsRead(messageId);

  // 2. Get or create user
  const profileName =
    value.contacts && value.contacts[0] ? value.contacts[0].profile?.name : null;
  const user = await userService.findOrCreateUser(from, profileName);

  // 3. Update streak
  user.updateStreak();

  const lower = (text || '').trim().toLowerCase();

  // 3a. STRICT MODE COMMANDS (flexible)
  const hasStrict = lower.includes('strict');
  const hasOn =
    lower.includes(' on') ||
    lower.startsWith('on ') ||
    lower.includes('enable') ||
    lower.includes('start');
  const hasOff =
    lower.includes('off') ||
    lower.includes('disable') ||
    lower.includes('stop') ||
    lower.includes('remove');

  if (hasStrict && hasOn) {
    user.strictMode = true;
    await user.save();
    await whatsappService.sendTextMessage(
      from,
      'Strict mode ON. Now I’ll be a bit more honest and direct on big non‑essential spends – almost like a money coach + parent combo.'
    );
    return;
  }

  if (hasStrict && hasOff) {
    user.strictMode = false;
    await user.save();
    await whatsappService.sendTextMessage(
      from,
      'Strict mode OFF. I’ll keep things softer and more neutral from now on.'
    );
    return;
  }

  // 3b. Handle greetings as a special case (fresh start)
  if (['hi', 'hello', 'hey', 'start'].includes(lower)) {
    // Clear old conversation context so AI doesn't drag past topics
    user.conversationHistory = [];
    await user.save();

    const welcome =
      'Hi 👋\n' +
      'I’m Savezra, your personal money coach on WhatsApp.\n\n' +
      'I help you understand where your money is going, cut unnecessary spends, and build simple habits to save, invest and grow wealth – without boring spreadsheets or heavy jargon.\n\n' +
      'Think of me as your money partner who helps you make better decisions step by step 💸📈\n\n' +
      'Over time, I can help you with:\n' +
      '• Tracking your daily expenses\n' +
      '• Finding “money leaks”\n' +
      '• Monthly savings & budget planning\n' +
      '• Simple investment guidance based on your goals\n' +
      '• Emergency fund & future planning\n' +
      '• Tax planning & ITR guidance:\n' +
      '  – Which ITR form may apply\n' +
      '  – What income & deductions to consider\n' +
      '  – How to stay compliant and avoid last‑minute tax stress\n\n' +
      'We’ll go at your pace. Everything stays simple, practical and personalised.\n\n' +
      'Whenever you’re ready, reply with one line about your situation. For example:\n' +
      '• "I don’t know where my salary goes"\n' +
      '• "I overspend on food & clothes"\n' +
      '• "I need to save for my marriage"\n\n' +
      'Note: I am not a SEBI/RBI registered advisor. Treat this as education, not guaranteed financial advice.';

    await whatsappService.sendTextMessage(from, welcome);

    logger.info('Sent scripted welcome', { whatsappId: from });
    return; // Do NOT call AI for plain hi/hello/start
  }

  // 3c. Savings impact / forecast commands (impact / plan)
  if (
    lower.startsWith('impact') ||
    lower.startsWith('plan') ||
    lower.startsWith('save more')
  ) {
    const impactText = await buildSavingsImpactFromText(user, text);
    await whatsappService.sendTextMessage(from, impactText);
    logger.info('Sent savings impact forecast', { whatsappId: from });
    return;
  }

  // 3d. Monthly financial health score
  if (
    lower === 'health' ||
    lower === 'score' ||
    lower.includes('financial health')
  ) {
    const result = await computeMonthlyHealth(user);
    const summary = buildHealthSummaryText(result);
    await whatsappService.sendTextMessage(from, summary);
    logger.info('Sent monthly health score', { whatsappId: from });
    return;
  }

  // 4. Normal AI flow for all other messages
  user.addToConversation('user', text);

  const aiResponse = await aiService.getAIResponse(user, text);

  logger.info('AI response received', {
    whatsappId: from,
    action: aiResponse.action,
    elapsed: Date.now() - startTime,
  });

  // 5. Dispatch action (log transaction, update salary, etc.)
  const replyMessage = await actionDispatcher.dispatch(user, aiResponse);

  // 6. Save assistant message to history
  user.addToConversation('assistant', replyMessage);
  await user.save();

  // 7. Send reply via WhatsApp
  await whatsappService.sendTextMessage(from, replyMessage);

  logger.info('Reply sent', {
    whatsappId: from,
    action: aiResponse.action,
    totalElapsed: Date.now() - startTime,
  });
}

module.exports = {
  verify,
  handleIncoming,
};