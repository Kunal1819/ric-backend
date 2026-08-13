require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. Import all routers at the top
const profilesRouter = require('./routes/profiles');
const competitionsRouter = require('./routes/competitions');
const meRouter = require('./routes/me');
const teamsRouter = require('./routes/teams');

const app = express();

// 2. Global Middleware (MUST be above the routes!)
app.use(cors());
app.use(express.json());

// 3. Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 4. Register all API Routes
app.use('/api/profiles', profilesRouter);
app.use('/api/competitions', competitionsRouter);
app.use('/api/me', meRouter);
app.use('/api/teams', teamsRouter);

// 5. Start the Server at the very bottom
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RIC backend listening on port ${PORT}`));