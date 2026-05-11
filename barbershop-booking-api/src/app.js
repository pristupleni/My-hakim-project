const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Добавили ИИ

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const openapi = require('./docs/openapi.json');
const { attachRequestId, requestLogger } = require('./middleware/request-context');
const { logger } = require('./utils/logger');

function createApp() {
  const app = express();

  // Инициализация Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const rawCors = (process.env.CORS_ORIGIN || '').trim();
  const corsOrigin = !rawCors || rawCors === '*'
    ? true
    : rawCors.split(',').map((o) => o.trim());

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(attachRequestId);
  app.use(requestLogger);

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));
  app.use('/api', publicRoutes);
  app.use('/api/admin', adminRoutes);

  // --- НОВЫЙ РОУТ ДЛЯ ИИ-АГЕНТА ---
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'API ключ не настроен в Render' });
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      // Здесь ты можешь написать инструкции (промпт) для своего агента
      const prompt = `Ты — эксперт-помощник в барбершопе "Hakim". 
      Твоя цель — помогать администратору. Отвечай кратко, профессионально и на языке запроса. 
      Вопрос: ${message}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      res.json({ response: response.text() });
    } catch (error) {
      logger.error('AI_CHAT_ERROR', { message: error.message });
      res.status(500).json({ error: 'Ошибка ИИ-агента' });
    }
  });
  // --------------------------------

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    logger.error('request.error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error' });
  });

  return app;
}

module.exports = { createApp };