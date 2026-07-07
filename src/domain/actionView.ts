export const actionViews = ['list', 'flow'] as const

export type ActionView = (typeof actionViews)[number]
