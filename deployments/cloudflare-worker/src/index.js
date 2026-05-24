import { handle } from "../../../core/index.js";

export default {
  async fetch(request, env) {
    return handle(request, env);
  }
};
