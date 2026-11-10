import { COMMAND_APPROVAL, FILE_APPROVAL, MCP_REQUEST } from './native-requests.mjs';

const fail = () => Object.assign(new Error('Choose an approval option offered by the current native request.'), { status: 400 });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const same = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
  return object(left) && object(right) && Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
};
const copy = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(copy) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
const prefix = value => Array.isArray(value) && value.length > 0 && value.every(token => typeof token === 'string') && value[0].trim().length > 0;
const allowHost = value => exactKeys(value, ['host', 'action']) && value.action === 'allow' && typeof value.host === 'string' && value.host.length > 0 && value.host.length <= 255 && !/\s/.test(value.host);

export const isHumanCommandApproval = question => question?.method === COMMAND_APPROVAL && question.params?.kind === 'humanCommand';
export const isSupportedCommandApprovalKind = question => question?.method === COMMAND_APPROVAL
  && (question.params?.kind === undefined || ['command', 'humanCommand', 'writeStdin'].includes(question.params.kind));

function execAmendment(decision) {
  return exactKeys(decision, ['acceptWithExecpolicyAmendment']) && exactKeys(decision.acceptWithExecpolicyAmendment, ['execpolicy_amendment']) && prefix(decision.acceptWithExecpolicyAmendment.execpolicy_amendment);
}

function networkAmendment(decision) {
  return exactKeys(decision, ['applyNetworkPolicyAmendment']) && exactKeys(decision.applyNetworkPolicyAmendment, ['network_policy_amendment']) && allowHost(decision.applyNetworkPolicyAmendment.network_policy_amendment);
}

// Native tool approvals are distinct from arbitrary MCP forms, including empty forms.
export function isNativeToolApproval(question) {
  const params = question?.params;
  return question?.method === MCP_REQUEST && ['form', 'openai/form', 'openaiForm'].includes(params?.mode) && object(params?._meta) && params._meta.codex_approval_kind === 'mcp_tool_call';
}

function offeredPersistence(question, scope) {
  const offered = question.params._meta.persist;
  return offered === scope || (Array.isArray(offered) && offered.every(value => ['session', 'always'].includes(value)) && offered.includes(scope));
}

function commandDecisions(params) {
  // When supplied, the runtime's availableDecisions is authoritative. Older runtimes
  // expose proposals instead; never manufacture a prefix or destination from a command.
  if (params.availableDecisions != null) return Array.isArray(params.availableDecisions) ? params.availableDecisions : [];
  const decisions = ['accept', 'decline', 'cancel'];
  if (prefix(params.proposedExecpolicyAmendment)) decisions.push({ acceptWithExecpolicyAmendment: { execpolicy_amendment: params.proposedExecpolicyAmendment } });
  if (Array.isArray(params.proposedNetworkPolicyAmendments)) for (const amendment of params.proposedNetworkPolicyAmendments) {
    if (allowHost(amendment)) decisions.push({ applyNetworkPolicyAmendment: { network_policy_amendment: amendment } });
  }
  return decisions;
}

export function nativeApprovalChoices(question, { allowPersistent = true } = {}) {
  if (!object(question?.params)) return [];
  if (question.method === COMMAND_APPROVAL && !isSupportedCommandApprovalKind(question)) return [];
  if (isNativeToolApproval(question)) {
    const choices = [{ key: 'accept', label: 'Allow once', scope: null, persistent: false, answer: { decision: 'accept' } }];
    if (allowPersistent && offeredPersistence(question, 'session')) choices.push({ key: 'session', label: 'Allow for this session', scope: 'This native tool for this session.', persistent: false, answer: { decision: 'accept', persistence: 'session' } });
    if (allowPersistent && offeredPersistence(question, 'always')) choices.push({ key: 'always', label: 'Allow always', scope: 'This native tool; Codex manages the saved permission.', persistent: true, answer: { decision: 'accept', persistence: 'always' } });
    return choices.concat([
      { key: 'decline', label: 'Decline', scope: null, persistent: false, answer: { decision: 'decline' } },
      { key: 'cancel', label: 'Cancel', scope: null, persistent: false, answer: { decision: 'cancel' } }
    ]);
  }
  const command = question.method === COMMAND_APPROVAL;
  if (!command && question.method !== FILE_APPROVAL) return [];
  const human = isHumanCommandApproval(question);
  // FileChangeRequestApprovalParams has no availableDecisions in the native
  // protocol: its fixed response enum includes acceptForSession. Honor an
  // explicit restriction when supplied, without requiring a nonexistent field
  // to expose the ordinary native session choice. File approvals offer no
  // permanent grant.
  const offered = command ? commandDecisions(question.params) : question.params.availableDecisions == null ? ['accept', 'acceptForSession', 'decline', 'cancel'] : Array.isArray(question.params.availableDecisions) ? question.params.availableDecisions : [];
  const choices = [];
  for (const decision of offered) {
    // Fresh-human checkpoints cannot be satisfied by reusable grants, even if
    // malformed native metadata proposes a session or permanent decision.
    if (human && !['accept', 'decline', 'cancel'].includes(decision)) continue;
    let choice;
    if (['accept', 'decline', 'cancel'].includes(decision)) choice = { key: decision, label: { accept: 'Allow once', decline: 'Decline', cancel: 'Cancel turn' }[decision], scope: null, persistent: false };
    else if (allowPersistent && decision === 'acceptForSession') choice = { key: 'session', label: 'Allow for this session', scope: command ? 'This native approval for this session.' : question.params.grantRoot ? 'Requested write root for this session: ' + JSON.stringify(question.params.grantRoot) + '. Codex controls the effective grant.' : 'This file-change approval for this native session.', persistent: false };
    else if (allowPersistent && command && execAmendment(decision)) choice = { key: 'execpolicy', label: 'Allow always', scope: 'Commands beginning with ' + JSON.stringify(decision.acceptWithExecpolicyAmendment.execpolicy_amendment), persistent: true };
    else if (allowPersistent && command && networkAmendment(decision)) choice = { key: 'network', label: 'Allow always', scope: 'Network host: ' + decision.applyNetworkPolicyAmendment.network_policy_amendment.host, persistent: true };
    if (!choice || choices.some(existing => same(existing.answer.decision, decision))) continue;
    const matchingKeys = choices.filter(existing => existing.key === choice.key || existing.key.startsWith(choice.key + ':')).length;
    const key = choice.key === 'network' || matchingKeys ? choice.key + ':' + matchingKeys : choice.key;
    choices.push({ ...choice, key, answer: { decision: copy(decision) } });
  }
  return choices;
}

export function nativeApprovalAnswer(question, answer, options) {
  if (!object(answer) || Object.keys(answer).some(key => !['decision', 'persistence'].includes(key))) throw fail();
  const choice = nativeApprovalChoices(question, options).find(candidate => same(candidate.answer, answer));
  if (!choice) throw fail();
  if (isNativeToolApproval(question)) return { action: choice.answer.decision, content: null, _meta: choice.answer.persistence ? { persist: choice.answer.persistence } : null };
  return { decision: copy(choice.answer.decision) };
}
