import { ChatMessage, MessageRole } from '../types/llmTypes';
import { ChatSession } from '../components/ChatHistorySidebar';
import { Workspace } from '../types/WorkspaceTypes';

// Valid message roles
const VALID_MESSAGE_ROLES: MessageRole[] = ['system', 'user', 'assistant'];
const VALID_TARGET_TYPES: ChatSession['targetType'][] = ['file', 'selection', 'general', undefined];

export function isChatMessage(obj: any): obj is ChatMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const hasId = typeof obj.id === 'string';
  const hasRole =
    typeof obj.role === 'string' && VALID_MESSAGE_ROLES.includes(obj.role as MessageRole);
  const hasContent = typeof obj.content === 'string';
  const hasTimestamp = typeof obj.timestamp === 'number';
  return hasId && hasRole && hasContent && hasTimestamp;
}

export function isChatSession(obj: any): obj is ChatSession {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const hasId = typeof obj.id === 'string';
  const hasTitle = typeof obj.title === 'string';
  const hasLastUpdated = typeof obj.lastUpdated === 'number';
  const hasMessages = Array.isArray(obj.messages) && obj.messages.every(isChatMessage);
  const hasValidTargetType =
    obj.targetType === undefined ||
    (typeof obj.targetType === 'string' &&
      VALID_TARGET_TYPES.includes(obj.targetType as ChatSession['targetType']));
  const hasValidTargetName = obj.targetName === undefined || typeof obj.targetName === 'string';
  const hasValidUserPreview = obj.userPreview === undefined || typeof obj.userPreview === 'string';
  const hasValidFilePath = obj.filePath === undefined || typeof obj.filePath === 'string';
  const hasValidModelId =
    obj.modelId === undefined || typeof obj.modelId === 'string' || obj.modelId === null;
  const hasValidProviderConfig =
    obj.providerConfig === undefined ||
    typeof obj.providerConfig === 'object' ||
    obj.providerConfig === null;

  return (
    hasId &&
    hasTitle &&
    hasLastUpdated &&
    hasMessages &&
    hasValidTargetType &&
    hasValidTargetName &&
    hasValidUserPreview &&
    hasValidFilePath &&
    hasValidModelId &&
    hasValidProviderConfig
  );
}

export function isWorkspace(obj: any): obj is Workspace {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const hasId = typeof obj.id === 'string';
  const hasName = typeof obj.name === 'string';
  const hasFolderPath = typeof obj.folderPath === 'string' || obj.folderPath === null;
  const hasCreatedAt = typeof obj.createdAt === 'number';
  const hasLastUsed = typeof obj.lastUsed === 'number';
  return hasId && hasName && hasFolderPath && hasCreatedAt && hasLastUsed;
}
