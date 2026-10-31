import { migration0001 } from './0001_init';
import { migration0002 } from './0002_learning';
import { migration0003 } from './0003_metatrader_tasks';
import { migration0004 } from './0004_mt_task_draft';
import { migration0005 } from './0005_practice';
import { migration0006 } from './0006_replay_step_backs';
import { migration0007 } from './0007_paper_journal';
import { migration0008 } from './0008_trading_plan';
import { migration0009 } from './0009_lab_attempts';
import { migration0010 } from './0010_strategy_study';
import { migration0011 } from './0011_backtests';
import { migration0012 } from './0012_award_unlocks';
import { migration0013 } from './0013_market_data';
import { migration0014 } from './0014_provider_dataset_versions';
import type { Migration } from './types';

export type { Migration } from './types';

/** All migrations in ascending version order. Append only. */
export const MIGRATIONS: readonly Migration[] = [migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013, migration0014];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
