require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. Import all routers
const profilesRouter = require('./routes/profiles');
const competitionsRouter = require('./routes/competitions');
const meRouter = require('./routes/me');
const teamsRouter = require('./routes/teams');
const adminRouter = require('./routes/admin');
const eventsRouter = require('./routes/events');

const app = express();

// 2. Global Middleware
app.use(cors());
app.use(express.json());

// 3. Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 4. Register all API Routes
app.use('/api/profiles', profilesRouter);
app.use('/api/competitions', competitionsRouter);
app.use('/api/me', meRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/events', eventsRouter);

// 5. Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RIC backend listening on port ${PORT}`));