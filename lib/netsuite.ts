import OAuth from 'oauth-1.0a';
import crypto from 'crypto-js';
import axios from 'axios';

export interface NetSuiteConfig {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
  realm: string;
  baseUrl: string;
}

export interface NetSuiteProduct {
  id: string;
  itemid: string;
  displayname: string;
  description?: string;
  baseprice?: number;
  isinactive?: boolean;
  type?: string;
  upccode?: string;
  weight?: number;
  custitem_qiqi_sku?: string;
  custitem_qiqi_americas_price?: number;
  custitem_qiqi_international_price?: number;
  custitem_qiqi_case_pack?: number;
  custitem_qiqi_size?: string;
  custitem_qiqi_support_funds?: boolean;
  custitem_qiqi_visible_americas?: boolean;
  custitem_qiqi_visible_international?: boolean;
}

export interface NetSuiteCustomer {
  id: string;
  entityid: string;
  companyname: string;
  email?: string;
  phone?: string;
  subsidiary?: {
    id: string;
    name: string;
  };
}

export interface NetSuiteSalesOrder {
  id?: string;
  entity: {
    id: string;
  };
  trandate: string;
  item: Array<{
    item: {
      id: string;
    };
    quantity: number;
    rate: number;
    amount?: number;
  }>;
  memo?: string;
  subsidiary?: {
    id: string;
  };
  location?: {
    id: string;
  };
  status?: string;
}

export class NetSuiteAPI {
  private oauth: OAuth;
  private config: NetSuiteConfig;

  constructor(config: NetSuiteConfig) {
    this.config = config;
    this.oauth = new OAuth({
      consumer: {
        key: config.consumerKey,
        secret: config.consumerSecret,
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base_string: string, key: string) {
        return crypto.HmacSHA256(base_string, key).toString(crypto.enc.Base64);
      },
    });
  }

  private getAuthHeader(url: string, method: string) {
    const requestData = {
      url,
      method,
    };

    const token = {
      key: this.config.tokenId,
      secret: this.config.tokenSecret,
    };

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, token)
    );

    return authHeader.Authorization;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const authHeader = this.getAuthHeader(url, method);

    const config = {
      method,
      url,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      data: data ? JSON.stringify(data) : undefined,
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error: any) {
      console.error('NetSuite API Error:', error.response?.data || error.message);
      throw new Error(`NetSuite API Error: ${error.response?.data?.message || error.message}`);
    }
  }

  // Fetch products from NetSuite
  async getProducts(limit: number = 1000, offset: number = 0): Promise<NetSuiteProduct[]> {
    const endpoint = `/record/v1/item?limit=${limit}&offset=${offset}`;
    const response = await this.makeRequest<{ items: NetSuiteProduct[] }>(endpoint);
    return response.items || [];
  }

  // Get a specific product by ID
  async getProduct(id: string): Promise<NetSuiteProduct> {
    const endpoint = `/record/v1/item/${id}`;
    return await this.makeRequest<NetSuiteProduct>(endpoint);
  }

  // Search products by criteria
  async searchProducts(criteria: any): Promise<NetSuiteProduct[]> {
    const endpoint = `/record/v1/item/search`;
    const response = await this.makeRequest<{ items: NetSuiteProduct[] }>(endpoint, 'POST', criteria);
    return response.items || [];
  }

  // Fetch customers from NetSuite
  async getCustomers(limit: number = 1000, offset: number = 0): Promise<NetSuiteCustomer[]> {
    const endpoint = `/record/v1/customer?limit=${limit}&offset=${offset}`;
    const response = await this.makeRequest<{ items: NetSuiteCustomer[] }>(endpoint);
    return response.items || [];
  }

  // Get a specific customer by ID
  async getCustomer(id: string): Promise<NetSuiteCustomer> {
    const endpoint = `/record/v1/customer/${id}`;
    return await this.makeRequest<NetSuiteCustomer>(endpoint);
  }

  // Create a sales order in NetSuite
  async createSalesOrder(order: NetSuiteSalesOrder): Promise<NetSuiteSalesOrder> {
    const endpoint = `/record/v1/salesOrder`;
    return await this.makeRequest<NetSuiteSalesOrder>(endpoint, 'POST', order);
  }

  // Get a sales order by ID
  async getSalesOrder(id: string): Promise<NetSuiteSalesOrder> {
    const endpoint = `/record/v1/salesOrder/${id}`;
    return await this.makeRequest<NetSuiteSalesOrder>(endpoint);
  }

  // Update a sales order
  async updateSalesOrder(id: string, order: Partial<NetSuiteSalesOrder>): Promise<NetSuiteSalesOrder> {
    const endpoint = `/record/v1/salesOrder/${id}`;
    return await this.makeRequest<NetSuiteSalesOrder>(endpoint, 'PUT', order);
  }

  // Transform sales order to item fulfillment
  async fulfillSalesOrder(salesOrderId: string): Promise<any> {
    const endpoint = `/record/v1/salesOrder/${salesOrderId}/!transform/itemFulfillment`;
    return await this.makeRequest<any>(endpoint, 'POST');
  }

  // Test connection to NetSuite
  async testConnection(): Promise<boolean> {
    try {
      await this.getProducts(1, 0);
      return true;
    } catch (error) {
      console.error('NetSuite connection test failed:', error);
      return false;
    }
  }
}

// Factory function to create NetSuite API instance
export function createNetSuiteAPI(): NetSuiteAPI {
  const config: NetSuiteConfig = {
    accountId: process.env.NETSUITE_ACCOUNT_ID || '',
    consumerKey: process.env.NETSUITE_CONSUMER_KEY || '',
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET || '',
    tokenId: process.env.NETSUITE_TOKEN_ID || '',
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET || '',
    realm: process.env.NETSUITE_REALM || '',
    baseUrl: `https://${process.env.NETSUITE_ACCOUNT_ID || ''}.suitetalk.api.netsuite.com/services/rest/record/v1`,
  };

  return new NetSuiteAPI(config);
}
