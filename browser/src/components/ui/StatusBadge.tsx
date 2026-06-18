const STATUS_BADGE: Record<string, string> = {
  confirmed:    'badge-green',
  received:     'badge-green',
  RECEIVED:     'badge-green',
  completed:    'badge-green',
  receive:      'badge-green',
  pending:      'badge-yellow',
  submitted:    'badge-yellow',
  transferring: 'badge-blue',
  delivered:    'badge-blue',
  SENT:         'badge-red',
  send:         'badge-red',
  spent:        'badge-gray',
  invalid:      'badge-red',
  failed:       'badge-red',
  MINT:         'badge-purple',
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`badge ${STATUS_BADGE[status] ?? 'badge-gray'}`}>{status}</span>;
}
