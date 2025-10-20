const LEETCODE_ORIGIN = 'https://leetcode.com';
const GRAPHQL_ENDPOINT = `${LEETCODE_ORIGIN}/graphql`;
const USER_PROFILE_QUERY = `
  query leetpetUserProfile($username: String!) {
    allQuestionsCount {
      difficulty
      count
    }
    matchedUser(username: $username) {
      contributions {
        points
      }
      profile {
        reputation
        ranking
      }
      submissionCalendar
      submitStats {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
        totalSubmissionNum {
          difficulty
          count
          submissions
        }
      }
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
        totalSubmissionNum {
          difficulty
          count
          submissions
        }
      }
      userCalendar {
        streak
        totalActiveDays
      }
    }
    recentSubmissionList(username: $username) {
      title
      titleSlug
      timestamp
      statusDisplay
      lang
      __typename
    }
  }
`;

export async function ensureLeetCodeSession() {
  try {
    const session = await chrome.cookies.get({
      url: LEETCODE_ORIGIN,
      name: 'LEETCODE_SESSION'
    });
    return Boolean(session);
  } catch (error) {
    console.warn('LeetPet: unable to read LeetCode session cookie', error);
    return false;
  }
}

export async function fetchUserProgress() {
  const status = await fetchGraphQL(
    `query globalData {
      userStatus {
        isSignedIn
        username
      }
    }`
  );

  const userStatus = status?.data?.userStatus;
  if (!userStatus?.isSignedIn || !userStatus?.username) {
    return { authenticated: false };
  }

  const username = userStatus.username;
  const [profileResponse, summary] = await Promise.all([
    fetchGraphQL(USER_PROFILE_QUERY, { username }),
    fetchGlobalSummary()
  ]);

  if (profileResponse?.errors?.length) {
    const message = profileResponse.errors[0]?.message ?? 'Unknown GraphQL error';
    throw new Error(`Failed to load profile: ${message}`);
  }

  const profileData = formatProfileData(profileResponse?.data);
  if (!profileData) {
    throw new Error('LeetPet could not load your LeetCode profile.');
  }
  const submissionStats =
    profileResponse?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
  const totals = aggregateSubmissionStats(submissionStats);
  const streak = profileResponse?.data?.matchedUser?.userCalendar?.streak ?? 0;
  const totalActiveDays =
    profileResponse?.data?.matchedUser?.userCalendar?.totalActiveDays ?? 0;

  return {
    authenticated: true,
    username,
    totals,
    streak,
    totalActiveDays,
    allQuestionsCount: profileData?.totalQuestions ?? summary?.allQuestions ?? 0,
    timestamp: Date.now(),
    profile: profileData
  };
}

export async function fetchDailyChallenge() {
  const result = await fetchGraphQL(
    `query questionOfToday {
      activeDailyCodingChallengeQuestion {
        date
        userStatus
        question {
          questionId
          title
          titleSlug
          difficulty
        }
      }
    }`
  );

  const challenge = result?.data?.activeDailyCodingChallengeQuestion;
  if (!challenge) {
    return null;
  }

  return {
    date: challenge.date,
    questionId: challenge.question?.questionId,
    title: challenge.question?.title,
    slug: challenge.question?.titleSlug,
    difficulty: challenge.question?.difficulty,
    completed: challenge.userStatus === 'Finish'
  };
}

async function fetchGlobalSummary() {
  const response = await fetch(`${LEETCODE_ORIGIN}/api/problems/all/`, {
    method: 'GET',
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch global stats: ${response.status}`);
  }
  const data = await response.json();
  return {
    allQuestions: data.num_total ?? 0
  };
}

async function fetchGraphQL(query, variables) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Referer': LEETCODE_ORIGIN
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL error: ${response.status} ${text}`);
  }

  return response.json();
}

function aggregateSubmissionStats(stats = []) {
  return stats.reduce(
    (acc, item) => {
      const difficulty = item.difficulty?.toLowerCase();
      const count = item.count ?? 0;
      if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
        acc[difficulty] = count;
      }
      acc.total += count;
      return acc;
    },
    { easy: 0, medium: 0, hard: 0, total: 0 }
  );
}

function formatProfileData(data) {
  if (!data?.matchedUser) {
    return null;
  }

  const allQuestions = Array.isArray(data.allQuestionsCount) ? data.allQuestionsCount : [];
  const totalQuestions = allQuestions.find((item) => item.difficulty === 'All')?.count ?? 0;
  const easyCount = allQuestions.find((item) => item.difficulty === 'Easy')?.count ?? 0;
  const mediumCount = allQuestions.find((item) => item.difficulty === 'Medium')?.count ?? 0;
  const hardCount = allQuestions.find((item) => item.difficulty === 'Hard')?.count ?? 0;

  const submissionCalendarRaw = data.matchedUser.submissionCalendar ?? '{}';
  let submissionCalendar = {};
  if (typeof submissionCalendarRaw === 'string') {
    try {
      submissionCalendar = JSON.parse(submissionCalendarRaw);
    } catch (error) {
      console.warn('LeetPet: failed to parse submission calendar', error);
    }
  }

  const totalSolved =
    data.matchedUser.submitStats?.acSubmissionNum?.[0]?.count ??
    data.matchedUser.submitStatsGlobal?.acSubmissionNum?.[0]?.count ??
    0;

  return {
    totalSolved,
    totalSubmissions: data.matchedUser.submitStats?.totalSubmissionNum ?? [],
    totalQuestions,
    easySolved: data.matchedUser.submitStats?.acSubmissionNum?.[1]?.count ?? 0,
    totalEasy: easyCount,
    mediumSolved: data.matchedUser.submitStats?.acSubmissionNum?.[2]?.count ?? 0,
    totalMedium: mediumCount,
    hardSolved: data.matchedUser.submitStats?.acSubmissionNum?.[3]?.count ?? 0,
    totalHard: hardCount,
    ranking: data.matchedUser.profile?.ranking ?? null,
    contributionPoint: data.matchedUser.contributions?.points ?? 0,
    reputation: data.matchedUser.profile?.reputation ?? 0,
    submissionCalendar,
    recentSubmissions: data.recentSubmissionList ?? [],
    submitStats: data.matchedUser.submitStats ?? null,
    matchedUserStats: data.matchedUser.submitStatsGlobal ?? null
  };
}
