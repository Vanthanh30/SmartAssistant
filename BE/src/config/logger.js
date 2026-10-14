// Only explicit operational fields are logged; never request bodies, cookies or env values.
export function log(processName, event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), process: processName, event, ...fields }));
}
