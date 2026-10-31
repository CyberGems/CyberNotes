/** Both profile paths must already be absolute and resolved by the caller. */
export function isOnboardingTestProfile(options: {
  isDev: boolean;
  hasEnvironmentOverride: boolean;
  requestedProfile: string;
  onboardingProfile: string;
}): boolean {
  if (!options.isDev || options.hasEnvironmentOverride || !options.requestedProfile) return false;
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  return normalize(options.requestedProfile) === normalize(options.onboardingProfile);
}
