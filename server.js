require('dotenv').config();
const express = require('express');
const cors = require('cors');
const profilesRouter = require('./routes/profiles');
const competitionsRouter = require('./routes/competitions');

const app = express();
const meRouter = require('./routes/me');
app.use('/api/me', meRouter);
app.use('/api/competitions', competitionsRouter);

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/profiles', profilesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RIC backend listening on port ${PORT}`));
const teamsRouter = require('./routes/teams');
app.use('/api/teams', teamsRouter);
// server.js
const competitionsRouter = require('./routes/competitions');
app.use('/api/competitions', competitionsRouter);