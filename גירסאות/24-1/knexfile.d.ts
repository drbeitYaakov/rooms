import { Knex } from 'knex';

declare const knexConfig: {
  development: Knex.Config;
  test: Knex.Config;
  production: Knex.Config;
};

export default knexConfig;
