MRDA Rankings Algorithm using Linear Regression
===============
[Live MRDA Rankings Algorithm using Linear Regression](https://grimesbot.github.io/MRDA_LinearRegression_UI)

Summary
---------------
This repository produces rankings for the MRDA using sanctioned game scores from 2023 and onward based on the [2025 WFTDA Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf) which uses a statistical method called Linear Regression to calulate rankings points. 

Simple Explanation 
---------------
Other algorithms that have been used to aide in determing MRDA rankings such as Elo Rating or the Game Ranking Points based on WFTDA's 2023 algorithm calculate the contributions of each game based on the current standing of each team at the time of the game. Instead, this algorithm evaluates all games played in the rankings period.

For example, if Red team played Blue team yesterday, then the Blue team plays Green team today, today's game provides data about Blue and Green teams, but it also puts *yesterday’s* game in context so that we now know more about the Red team too. The advantage of this algorithm is that it will re-evaluate yesterday's game with the new information.

Terminology 
---------------
-   **Ranking Points**: A points value calculated by the ranking algorithm. Ranking Points represent the expected score ratio between two teams. For example, if Red team has double the ranking points of Blue team, Red team is predicted to win a game between the teams with double the score.
-   **Ranking**: An ordered list of teams and their Ranking Points.
-   **Rank**: The position teams with Active Status have within a given Ranking.
-   **Ranking Deadline**: The quarterly dates for which Rankings are published & cutoff for which games must be played *before* to be included. Always a Wednesday. This algorithm calculates rankings for every Wednesday for informational, historical and visualization purposes.
    -   *First Wednesday of March*: Beginning of Season
    -   *First Wednesday of June*: Playoffs and Championships Invites
    -   *First Wednesday of September*: Championships Seeding
    -   *First Wednesday of December*: End of Season
-   **Ranking Period**: The period of time in which games played are used to calculate a Ranking.  Generally considered the 12 months before the Ranking Deadline, we include games played on or after last year's Ranking Deadline up to the current Ranking Deadline. For example, June 2028 rankings will include games played before the first Wednesday of June 2028 (2028-6-7) and on or after the first Wednesday of June 2027 (2027-6-2). This is a few days more than 12 months, but if we used a strict rolling 12 month ranking period, games on the weekend of June 4-6, 2027 would not count for postseason invites in either 2027 or 2028.
-   **Seeding Ranking**: The Ranking from last "season" to give the algorithm a starting point for existing teams. The Ranking Points are used in the algorithm to connect all existing teams to a common "virtual" opponent. Since the MRDA generally uses a rolling 12 month season, we are using the Rankings calculated for last year's Ranking Deadline (see Ranking Period). For example, when calculating Rankings for the 3rd Wednesday of August 2025, we would use the Rankings calculated for the 3rd Wednesday of August 2024 as the Seeding Ranking.
-   **Error**: We are representing the [standard error](https://en.wikipedia.org/wiki/Standard_error) of the linear regression statistical method as a percentage (relative standard error) using ± and % symbols and error bars on team's historical ranking point charts. This helps highlight the algorithm's uncertainty for newer teams and teams who've played fewer games.
-   **Active Status**: Teams must play a minmum of 3 MRDA Sanctioned games against at least 2 unique opponents in the Ranking Period to achieve Active Status. Teams must maintain Active Status to earn a Rank.
-   **Postseason Eligible**: Teams must maintain Active Status and play a minmum of 5 MRDA Sanctioned in the Ranking Period to be eligible for invites to postseason tournaments. This measure must be met in both the June AND September Ranking periods of that year to qualify/maintain their invite.

Where Do We Start? 
---------------
We use a rolling season but came back from a prolonged pandemic break. A decision has to be made about when we start calculating historical rankings and how we handle seeding data. We have the benefit of hindsight with sanctioned game score data going back to late April of 2023. Western Hemisphere Cup is a logical place after which to start calculating Rankings (Wednesday, October 25th 2023), as it marks the first postseason event after the pandemic break. However, with only one season of data we do not have the benefit of any historical data to use as Seeding Rankings. Thankfully we can run the linear regression method without seeding data following the implementation section on page 11 of the [2025 WFTDA Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf) which omits virtual games and scales the Ranking Point results by 100. 

Using this method, our rankings will be based entirely on historical sanctioned scores and we do not need to resort to an unreliable or out-of-date source like Flat Track Stats. However, without Seeding Rankings and a common virtual opponent connecting teams the results are less accurate, so we use all data going back to April of 2023 in all of these calculations to improve accuracy. For example, September 2024 Rankings would include games from April '23 through August of '24 which is 16 months. This is longer than the typical 12 month ranking period, but the results will only ever be used as Seeding Rankings to make future calculations (e.g. September 2025) more accurate and never to determine any Rankings on it's own.

Starting Wednesday, October 23rd, 2024, a year after WHC and once we have global crossover data from 2024 Champs, we start using the previous years' results as Seeding Rankings. December 2024 rankings will be based on games from Dec '23 - Dec '24 and use the Dec '23 rankings as Seeding Rankings which were caluclated without historical data. Starting Wednesday, October 22nd, 2025, two years after WHC, all Rankings and the Seeding Rankings will be based on calculations which used virtual games and seeding data for highest accuracy.

Implementation 
---------------
LinearRegression.py gets 2023 game data hardcoded in Python in GameList_history.py and merges it with 2024 and newer game data retrieved from the MRDA Central API. Using this data it caluclates Rankings for each Wednesday starting October 25th 2023 (after Western Hemisphere Cup) through the upcoming ranking deadline date using the Weighted Least Squares method of the StatsModel Python package. LinearRegression.py writes all of this ranking data to a JavaScript variable linear_regression_ranking_history in linear_regression_rankings.js for visualization purposes in the local Web UI. It also writes all of the ranking results to as JSON to linear_regression_rankings.json for external use. Ideally this will be run on a daily schedule to update rankings based on new games or score corrections on MRDA Central.

The Web UI at index.html displays the results in a chart and a table. It also caluclates Active Status and postseason eligibility using games data from the MRDA Central API. Details of a team's ranking history can be seen to compare their historical ranking points via linear regression compared to the games played and the Game Ranking Points they would have gotten from each game in the previous 2023 Game Points algorithm.