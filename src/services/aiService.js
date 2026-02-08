const OpenAI = require('openai');
const env = require('../config/env');
const logger = require('../utils/logger');
const { getSystemPrompt } = require('../prompts/systemPrompt');
const { buildUserContext } = require('../utils/contextBuilder');

const openai = new OpenAI({
  apiKey: env.openai.apiKey,
  baseURL: env.openai.baseUrl, // Groq OpenAI-compatible endpoint
});

/**
 * Get AI response for a user message.
 * Returns the parsed JSON action object from the model.
 */
async function getAIResponse(user, userMessage) {
  try {
    // Build dynamic context from Mongo
    const userContext = await buildUserContext(user);
    const systemPrompt = getSystemPrompt(userContext);

    // Build messages array: system + recent conversation history + new user message
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // Add conversation history (limited in User model to 40)
    for (const msg of user.conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add the new user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    logger.debug('Calling OpenAI/Groq', {
      whatsappId: user.whatsappId,
      messageCount: messages.length,
      model: env.openai.model,
    });

    const completion = await openai.chat.completions.create({
      model: env.openai.model,
      messages,
      temperature: 0.6,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const rawResponse = completion.choices[0]?.message?.content;

    if (!rawResponse) {
      throw new Error('Empty response from AI');
    }

    logger.debug('Raw AI response', { rawResponse });

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (parseErr) {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        logger.error('Failed to parse AI response as JSON', { rawResponse });
        parsed = {
          action: 'chat',
          message:
            'Sorry, I got confused for a moment. Could you say that again in simpler words?',
        };
      }
    }

    // Validate required fields
    if (!parsed.action || !parsed.message) {
      parsed.action = parsed.action || 'chat';
      parsed.message =
        parsed.message ||
        'Sorry, I had a small hiccup. Could you try saying that again?';
    }

    // Validate action value
    const validActions = [
      'log_transaction',
      'update_salary',
      'log_debt',
      'log_goal',
      'chat',
    ];
    if (!validActions.includes(parsed.action)) {
      logger.warn('Invalid action from AI, defaulting to chat', {
        action: parsed.action,
      });
      parsed.action = 'chat';
    }

    return parsed;
  } catch (error) {
    logger.error('AI service error', {
      error: error.message,
      stack: error.stack,
    });

    // Return a user-friendly fallback
    return {
      action: 'chat',
      message:
        "I'm having a moment. Could you send that again in a few seconds? 🙏",
    };
  }
}

module.exports = {
  getAIResponse,
};