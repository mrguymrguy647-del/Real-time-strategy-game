// Custom actions a data effect can request with { "do": "<id>", ...args } (DATA_SCHEMAS §3.2).
// Everything else a data file wants is a plain stat effect. `args` lists the required extra
// fields; the validator checks them. The code that performs each action arrives with the system
// that needs it.

/** @type {Record<string, { args: string[] }>} */
export const ACTIONS = {
  setFlag: { args: ['flag'] },
  addNews: { args: ['template'] },
  startEvent: { args: ['event'] },
  changeGovernment: { args: ['government'] },
  instantPolicy: { args: [] },
  startPlan: { args: [] },
};

/** @param {string} id */
export function isAction(id) {
  return Object.hasOwn(ACTIONS, id);
}
