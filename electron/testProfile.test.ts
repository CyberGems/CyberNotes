import { describe, expect, it } from 'vitest';
import { isOnboardingTestProfile } from './testProfile';

describe('onboarding test profile', () => {
  const onboardingProfile = '/test-app/.onboarding-test';
  const options = { isDev: true, hasEnvironmentOverride: false, requestedProfile: onboardingProfile, onboardingProfile };

  it('matches the explicitly named development profile', () => {
    expect(isOnboardingTestProfile(options)).toBe(true);
  });

  it.each([
    { isDev: false },
    { hasEnvironmentOverride: true },
    { requestedProfile: '' },
    { requestedProfile: '/test-app/.onboarding-test-other' },
    { requestedProfile: '/test-app/.onboarding-test/nested' },
  ])('leaves all other profiles untouched: %o', change => {
    expect(isOnboardingTestProfile({ ...options, ...change })).toBe(false);
  });
});
