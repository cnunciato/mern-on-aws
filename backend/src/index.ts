import express from "express";
import cors from 'cors';
import { itemsRouter } from "./routes";

const port = process.env.BACKEND_SERVICE_PORT || 8000;
const prefix = process.env.BACKEND_ROUTE_PREFIX || "/api";
const app = express();

app.use(cors());
app.use(express.json());
app.use(`${prefix}/items`, itemsRouter);
app.get('/', (req, res) => {
    res.send('ok')
});

const server = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
