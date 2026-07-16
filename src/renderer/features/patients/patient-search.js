export function createLatestPatientSearch(searchOperation) {
  let requestVersion = 0;
  return async function latestSearch(term) {
    const version = ++requestVersion;
    const result = await searchOperation(term);
    return version === requestVersion ? { current: true, result } : { current: false, result: null };
  };
}
