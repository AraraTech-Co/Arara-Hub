const GITHUB_PR =
  /^https?:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?(?:\?.*)?$/i

const GITLAB_MR =
  /^https?:\/\/(?:www\.)?gitlab\.com\/.+\/merge_requests\/\d+\/?(?:\?.*)?$/i

const BITBUCKET_PR =
  /^https?:\/\/(?:www\.)?bitbucket\.org\/[^/]+\/[^/]+\/pull-requests\/\d+\/?(?:\?.*)?$/i

/**
 * Validates and normalizes a Pull Request URL.
 * Accepts GitHub pull, GitLab merge request, and Bitbucket pull-request URLs.
 * Returns null for empty/invalid values.
 */
export function validatePullRequestUrl(url: string | null | undefined): string | null {
  if (url == null) return null

  const trimmed = url.trim()
  if (!trimmed) return null

  if (GITHUB_PR.test(trimmed) || GITLAB_MR.test(trimmed) || BITBUCKET_PR.test(trimmed)) {
    return trimmed
  }

  return null
}

export const PULL_REQUEST_URL_ERROR =
  'URL de PR inválida (GitHub, GitLab ou Bitbucket)'
