import type { MultistatusResource } from "./webdav-xml.ts";

export type ResponseModel =
  | EmptyResponseModel
  | BodyResponseModel
  | MultistatusResponseModel;

export type EmptyResponseModel = {
  type: "empty";
  status: number;
  statusText?: string;
  headers?: HeadersInit;
};

export type BodyResponseModel = {
  type: "body";
  status: number;
  statusText?: string;
  body: BodyInit;
  headers?: HeadersInit;
};

export type MultistatusResponseModel = {
  type: "multistatus";
  status?: number;
  statusText?: string;
  resources: MultistatusResource[];
  cursor?: number;
  headers?: HeadersInit;
};
