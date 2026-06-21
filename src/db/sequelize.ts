import { Sequelize } from 'sequelize';
import { loadConfig } from '../config/config';

const config = loadConfig();

const sequelize = new Sequelize(
  config.db.name,
  config.db.user,
  config.db.password,
  {
    host:    config.db.host,
    port:    config.db.port,
    dialect: 'mysql',
    logging: config.nodeEnv !== 'test' ? console.log : false,
  },
);

export default sequelize;

/**
 * Verifies the database connection by calling sequelize.authenticate().
 * Throws on failure so the process can exit cleanly at startup.
 */
export async function connectDb(): Promise<void> {
  await sequelize.authenticate();
  console.log('[db] Database connection established successfully.');
}
