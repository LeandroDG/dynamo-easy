import * as DynamoDB from 'aws-sdk/clients/dynamodb'
import { promiseTap, randomExponentialBackoffTimer } from '../../../helper'
import { createLogger, Logger } from '../../../logger/logger'
import { Attributes, createToKeyFn, fromDb } from '../../../mapper'
import { ModelConstructor } from '../../../model'
import { BATCH_GET_DEFAULT_TIME_SLOT, BATCH_GET_MAX_REQUEST_ITEM_COUNT } from '../../batchget'
import { batchGetItemsFetchAll } from '../../batchget/batch-get-utils'
import { DynamoRx } from '../../dynamo-rx'
import { BaseRequest } from '../base.request'
import { BatchGetSingleTableResponse } from './batch-get-single-table.response'

export class BatchGetSingleTableRequest<T> extends BaseRequest<T,
  DynamoDB.BatchGetItemInput,
  BatchGetSingleTableRequest<T>> {
  private readonly logger: Logger

  constructor(dynamoRx: DynamoRx, modelClazz: ModelConstructor<T>, keys: Array<Partial<T>>) {
    super(dynamoRx, modelClazz)
    this.logger = createLogger('dynamo.request.BatchGetSingleTableRequest', modelClazz)

    if (keys.length > BATCH_GET_MAX_REQUEST_ITEM_COUNT) {
      throw new Error(`you can request at max ${BATCH_GET_MAX_REQUEST_ITEM_COUNT} items per request`)
    }

    this.params.RequestItems = {
      [this.tableName]: {
        Keys: keys.map(createToKeyFn(modelClazz)),
      },
    }
  }

  consistentRead(value: boolean = true): BatchGetSingleTableRequest<T> {
    this.params.RequestItems[this.tableName].ConsistentRead = value
    return this
  }

  /**
   * fetch all entries and return an the raw response (no mapping of items)
   * @param backoffTimer when unprocessed keys are returned the next value of backoffTimer is used to determine how many time slots to wait before doing the next request
   * @param throttleTimeSlot the duration of a time slot in ms
   */
  execNoMap(
    backoffTimer = randomExponentialBackoffTimer,
    throttleTimeSlot = BATCH_GET_DEFAULT_TIME_SLOT,
  ): Promise<DynamoDB.BatchGetItemOutput> {
    return this.fetch(backoffTimer, throttleTimeSlot)
  }

  /**
   * fetch all entries and return an object containing the mapped items and the other response data
   * @param backoffTimer when unprocessed keys are returned the next value of backoffTimer is used to determine how many time slots to wait before doing the next request
   * @param throttleTimeSlot the duration of a time slot in ms
   */
  execFullResponse(
    backoffTimer = randomExponentialBackoffTimer,
    throttleTimeSlot = BATCH_GET_DEFAULT_TIME_SLOT,
  ): Promise<BatchGetSingleTableResponse<T>> {
    return this.fetch(backoffTimer, throttleTimeSlot)
      .then(this.mapResponse)
      .then(promiseTap(response => this.logger.debug('mapped items', response.Items)))
  }

  /**
   * fetch all entries and return the mapped entries as an array
   * @param backoffTimer when unprocessed keys are returned the next value of backoffTimer is used to determine how many time slots to wait before doing the next request
   * @param throttleTimeSlot the duration of a time slot in ms
   */
  exec(backoffTimer = randomExponentialBackoffTimer, throttleTimeSlot = BATCH_GET_DEFAULT_TIME_SLOT): Promise<T[]> {
    return this.fetch(backoffTimer, throttleTimeSlot)
      .then(this.mapResponse)
      .then(r => r.Items)
      .then(promiseTap(items => this.logger.debug('mapped items', items)))
  }

  private mapResponse = (response: DynamoDB.BatchGetItemOutput) => {
    let items: T[] = []
    if (response.Responses && Object.keys(response.Responses).length && response.Responses[this.tableName]) {
      const mapped: T[] = response.Responses[this.tableName].map(attributeMap =>
        fromDb(<Attributes<T>>attributeMap, this.modelClazz),
      )
      items = mapped
    }
    return {
      Items: items,
      UnprocessedKeys: response.UnprocessedKeys,
      ConsumedCapacity: response.ConsumedCapacity,
    }
  }

  private fetch(backoffTimer = randomExponentialBackoffTimer, throttleTimeSlot = BATCH_GET_DEFAULT_TIME_SLOT) {
    this.logger.debug('request', this.params)
    return batchGetItemsFetchAll(this.dynamoRx, { ...this.params }, backoffTimer(), throttleTimeSlot)
      .then(promiseTap(response => this.logger.debug('response', response)))
  }
}
