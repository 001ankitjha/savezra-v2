const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/savezra',
  },

  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
  },

  // We use Groq via the OpenAI-compatible API
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
};

// Validate critical env vars at startup
const required = [
  ['WHATSAPP_PHONE_NUMBER_ID', env.whatsapp.phoneNumberId],
  ['WHATSAPP_ACCESS_TOKEN', env.whatsapp.accessToken],
  ['WHATSAPP_VERIFY_TOKEN', env.whatsapp.verifyToken],
  ['OPENAI_API_KEY', env.openai.apiKey],
  ['MONGODB_URI', env.mongodb.uri],
];

for (const [name, value] of required) {
  if (!value) {
    console.error(`FATAL: Missing required environment variable ${name}`);
    process.exit(1);
  }
}

module.exports = env;