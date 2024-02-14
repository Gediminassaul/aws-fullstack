const express = require('express');
const bodyParser = require('body-parser');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
const { Client } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// Declare a new express app
const app = express();
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// Enable CORS for all methods
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// Function to initialize database connection
async function initDbConnection() {
  const secretsManagerClient = new SecretsManagerClient({
    region: "eu-north-1"
  });

  let secretResponse;
  try {
    secretResponse = await secretsManagerClient.send(
      new GetSecretValueCommand({
        SecretId: "postgresql",
        VersionStage: "AWSCURRENT"
      })
    );
  } catch (error) {
    throw error;
  }

  const secret = JSON.parse(secretResponse.SecretString);

  const dbClient = new Client({
    host: secret.host,
    port: secret.port,
    database: secret.dbname,
    user: secret.username,
    password: secret.password,
    ssl: {
      rejectUnauthorized: false // Set to true in production
    }
  });

  await dbClient.connect();
  return dbClient;
}

// Middleware to attach the database client to the request object
app.use(async (req, res, next) => {
  try {
    req.dbClient = await initDbConnection();
    next();
  } catch (error) {
    console.error('Error connecting to database', error);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

app.get('/cards', async (req, res) => {
  try {
    const result = await req.dbClient.query(
      `SELECT cards.id, cards.name, cards.position, 
      json_strip_nulls(
        json_agg(json_build_object(
          'id', tasks.id,
          'status', tasks.status,
          'description', tasks.description,
          'position', tasks.position
        ) ORDER BY tasks.position
      )) AS tasks
      FROM cards
      LEFT JOIN tasks ON cards.id = tasks.card_id
      GROUP BY cards.id, cards.name, cards.position`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ message: 'Query execution failed' });
  }
});

app.post('/todos', async (req, res) => {
  const { description, position, cardId } = req.body;
  try {
    await req.dbClient.query('INSERT INTO tasks (description, position, card_id) VALUES ($1, $2, $3)', [description, position, cardId]);
    res.status(200);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ message: 'Query execution failed' });
  }
});

app.post('/cards', async (req, res) => {
  const { userId, name, position } = req.body;
  try {
    await req.dbClient.query('INSERT INTO cards (user_id, name, position) VALUES ($1, $2, $3)', [userId, name, position]);
    res.status(200);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ message: 'Query execution failed' });
  }
});

app.put('/cards/:id', async (req, res) => {
  const { id } = req.params;
  const { name, position, tasks } = req.body;

  try {
    // Update the card details
    await req.dbClient.query(
      `UPDATE cards 
       SET name = $1, position = $2 
       WHERE id = $3`,
      [name, position, id]
    );

    if(!tasks) {
      return res.json({ message: 'Card updated successfully' });
    }
    const {rows: oldTasks} = await req.dbClient.query('SELECT id, status, position FROM tasks WHERE id = ANY($1)', [tasks.map(task => task.id)]);
    const filteredTasks = tasks.filter((task) => {
      const currentTask = oldTasks.some(t => t.id === task.id)
      return (task.status !== currentTask.status || task.position !== currentTask.position);
    });
    if(!filteredTasks.length) {
      return res.json({ message: 'Card and tasks updated successfully' });
    }
    for (const task of filteredTasks) {
      // Update existing task
      await req.dbClient.query(
        `UPDATE tasks 
          SET status = $1, position = $2, card_id = $3
          WHERE id = $4`,
        [task.status, task.position, id, task.id]
      );
    }

    return res.json({ message: 'Card and tasks updated successfully' });
  } catch (error) {
    console.error('Error executing update', error);
    res.status(500).json({ message: 'Update failed' });
  }
});

app.put('/todos/:todo', async (req, res) => {
  const { description, position, cardId } = req.body;
  try {
    await req.dbClient.query('UPDATE tasks SET description = $1, position = $2, card_id = $3 WHERE id = $4', [description, position, cardId, req.params.todo]);
    return res.status(200);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ message: 'Query execution failed' });
  }
})

// Listen for requests only when running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => {
    console.log("App started");
  });
}

// Export the app object for AWS Lambda
module.exports = app;