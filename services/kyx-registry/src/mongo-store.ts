import { MongoClient, type Collection, type Db } from 'mongodb';

import type {
  AgentRecord,
  KyxStore,
  OperatorRecord,
  SettlementRecord,
  TrustRecord,
} from './store.js';

const CI = { collation: { locale: 'en', strength: 2 } } as const;

const NO_ID = { projection: { _id: 0 } } as const;

function strip<T>(doc: (T & { _id?: unknown }) | null): T | undefined {
  if (!doc) return undefined;
  const { _id, ...rest } = doc as T & { _id?: unknown };
  return rest as T;
}

export class MongoKyxStore implements KyxStore {
  private readonly client: MongoClient;
  private db!: Db;
  private operators!: Collection<OperatorRecord>;
  private agents!: Collection<AgentRecord>;
  private settlements!: Collection<SettlementRecord>;
  private trust!: Collection<TrustRecord>;

  constructor(uri: string, private readonly dbName: string) {
    this.client = new MongoClient(uri);
  }

  async init(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.operators = this.db.collection<OperatorRecord>('operators');
    this.agents = this.db.collection<AgentRecord>('agents');
    this.settlements = this.db.collection<SettlementRecord>('settlements');
    this.trust = this.db.collection<TrustRecord>('trust');
    await Promise.all([
      this.operators.createIndex({ email: 1 }, { unique: true, ...CI }),
      this.operators.createIndex({ token: 1 }, { sparse: true }),
      this.agents.createIndex({ did: 1 }, { unique: true }),
      this.agents.createIndex({ publicKey: 1 }, CI),
      this.agents
        .createIndex({ agentName: 1, operatorEmail: 1 }, { unique: true, ...CI })
        .catch((err) => console.warn('[kyx-store] agentName+operatorEmail unique index not created:', err?.message)),
      this.settlements.createIndex({ settlementId: 1 }, { unique: true }),
      this.settlements.createIndex({ did: 1, settledAt: -1 }),
      this.trust.createIndex({ did: 1 }, { unique: true }),
    ]);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async listAgents(): Promise<AgentRecord[]> {
    return this.agents.find({}, NO_ID).sort({ registeredAt: -1 }).toArray();
  }

  async getAgent(did: string): Promise<AgentRecord | undefined> {
    return strip(await this.agents.findOne({ did }, NO_ID));
  }

  async getAgentByPublicKey(publicKey: string): Promise<AgentRecord | undefined> {
    return strip(await this.agents.findOne({ publicKey }, { ...NO_ID, ...CI }));
  }

  async getAgentByNameAndOperator(agentName: string, operatorEmail: string): Promise<AgentRecord | undefined> {
    return strip(await this.agents.findOne({ agentName, operatorEmail }, { ...NO_ID, ...CI }));
  }

  async getOperator(email: string): Promise<OperatorRecord | undefined> {
    return strip(await this.operators.findOne({ email }, { ...NO_ID, ...CI }));
  }

  async getOperatorByToken(token: string): Promise<OperatorRecord | undefined> {
    return strip(await this.operators.findOne({ token }, NO_ID));
  }

  async upsertOperator(operator: OperatorRecord): Promise<void> {
    await this.operators.replaceOne({ email: operator.email }, operator, { upsert: true, ...CI });
  }

  async addAgent(agent: AgentRecord): Promise<void> {
    await this.agents.insertOne({ ...agent });
  }

  async updateAgentOnChainStatus(did: string, status: AgentRecord['onChainStatus']): Promise<void> {
    await this.agents.updateOne({ did }, { $set: { onChainStatus: status } });
  }

  async listSettlements(did?: string): Promise<SettlementRecord[]> {
    return this.settlements
      .find(did ? { did } : {}, NO_ID)
      .sort({ settledAt: -1 })
      .toArray();
  }

  async addSettlement(settlement: SettlementRecord): Promise<void> {
    await this.settlements.updateOne(
      { settlementId: settlement.settlementId },
      { $setOnInsert: settlement },
      { upsert: true },
    );
  }

  async getTrust(did: string): Promise<TrustRecord | undefined> {
    return strip(await this.trust.findOne({ did }, NO_ID));
  }

  async putTrust(trust: TrustRecord): Promise<void> {
    await this.trust.replaceOne({ did: trust.did }, trust, { upsert: true });
  }
}
