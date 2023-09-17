interface LogMessage {
  status: "success" | "error" | "warning";
  emoji?: string;
  message: string;
  debug?: any;
  reason?: "user" | "system";
}

type LogFormatter = (message: LogMessage) => string;

const SUCCESS = "✅";
const ERROR = "❌";
const WARNING = "⚠️";

const USER = "👤";
const SYSTEM = "🤖";
const UNKNOWN = "❓";

export const beautifulFormatter: LogFormatter = (message) => {
  const successmoji =
    message.status === "success"
      ? SUCCESS
      : message.status === "error"
      ? ERROR
      : WARNING;
  const reasonmoji = message.reason === "user" ? USER : message.reason==="system" ? SYSTEM : UNKNOWN;
  const debug = message.debug ? ` Debug: ${JSON.stringify(message.debug)}` : "";
  return `${successmoji}${reasonmoji}${message.emoji ?? "📝"} ${
    message.message
  }${debug}`;
};

export const jsonFormatter: LogFormatter = (message) => {
  return JSON.stringify(message);
};

export const createLogger = (
  target: (text: String) => void = console.log,
  formatter: LogFormatter = beautifulFormatter
) => {
  return (message: LogMessage) => {
    target(formatter(message));
  };
};

export const unauthorizedMessage: (debug?: any) => LogMessage = (debug) => {
  return {
    status: "warning",
    reason: "user",
    message: "Unauthorized Request",
    debug,
    emoji: "🛂",
  };
};
