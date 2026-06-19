export interface KlaviyoMetric {
  id: string;
  name: string;
}

export interface KlaviyoMeasurements {
  count?: Array<number | string>;
}

export interface KlaviyoAggregateAttributes {
  dates: string[];
  data: Array<{ measurements: KlaviyoMeasurements }>;
}
