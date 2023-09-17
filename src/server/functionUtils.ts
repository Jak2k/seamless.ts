type Params = {
  [param: string]: string; // param: type
};

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func: Function) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if (result == null || result.length === 0) {
    return null;
  }
  return result;
}

export function functionReplacer(key: string, value: any) {
  if (typeof value === "function") {
    return {
      __function: true,
      parameters: getParamNames(value) || [],
    };
  }
  return value;
}
