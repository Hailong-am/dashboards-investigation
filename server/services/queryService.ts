/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import 'core-js/stable';
import _ from 'lodash';
import 'regenerator-runtime/runtime';
import { Logger } from '../../../../src/core/server';

export class QueryService {
  private client: any;
  constructor(client: any, private readonly logger: Logger) {
    this.client = client;
  }

  describeQueryInternal = async (
    request: any,
    format: string,
    responseFormat: string,
    context: any
  ) => {
    try {
      const queryRequest = {
        query: request.body,
      };
      const params = {
        body: JSON.stringify(queryRequest),
      };

      let client = this.client;
      let queryResponse;

      const { dataSourceMDSId } = request.query;
      if (dataSourceMDSId) {
        client = context.dataSource.opensearch.legacy.getClient(dataSourceMDSId);
        queryResponse = await client.callAPI(format, params);
      } else {
        queryResponse = await this.client.asScoped(request).callAsCurrentUser(format, params);
      }
      return {
        data: {
          ok: true,
          resp: _.isEqual(responseFormat, 'json') ? JSON.stringify(queryResponse) : queryResponse,
        },
      };
    } catch (err) {
      this.logger.info('error describeQueryInternal');
      this.logger.info(err);

      return {
        data: {
          ok: false,
          resp: err.response,
          body: err.body,
        },
      };
    }
  };

  describeSQLQuery = async (context: any, request: any) => {
    return this.describeQueryInternal(request, 'investigationNotebook.sqlQuery', 'json', context);
  };

  describePPLQuery = async (context: any, request: any) => {
    return this.describeQueryInternal(request, 'investigationNotebook.pplQuery', 'json', context);
  };
}
