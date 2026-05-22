import type { ResponseModel } from "./response-model.ts";
import { renderMultistatusXml } from "./webdav-xml.ts";

export function renderHttpResponse(model: ResponseModel): Response {
  switch (model.type) {
    case "empty":
      return new Response(null, {
        status: model.status,
        statusText: model.statusText ?? getStatusText(model.status),
        headers: model.headers,
      });
    case "body":
      return new Response(model.body, {
        status: model.status,
        statusText: model.statusText ?? getStatusText(model.status),
        headers: model.headers,
      });
    case "multistatus":
      return new Response(
        renderMultistatusXml({
          resources: model.resources,
          cursor: model.cursor,
        }),
        {
          status: model.status ?? 207,
          statusText: model.statusText ?? getStatusText(model.status ?? 207),
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            ...model.headers,
          },
        },
      );
  }
}

function getStatusText(status: number) {
  switch (status) {
    case 200:
      return "OK";
    case 204:
      return "No Content";
    case 207:
      return "Multi-Status";
    case 302:
      return "Found";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 422:
      return "Unprocessable Entity";
    case 500:
      return "Internal Server Error";
    case 501:
      return "Not Implemented";
    default:
      return "";
  }
}
