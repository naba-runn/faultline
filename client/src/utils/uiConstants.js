export const SEVERITY_LABEL = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
};

export const STATUS_OPTIONS = ['open', 'resolved', 'ignored'];

// Task 41: Incident status — a distinct enum from ErrorGroup's
// STATUS_OPTIONS above (different states: an incident can be
// "investigating", a group cannot; a group can be "ignored", an
// incident cannot).
export const INCIDENT_STATUS_OPTIONS = ['open', 'investigating', 'resolved'];
