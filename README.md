MRDA Rankings Algorithm using Linear Regression
===============
[Live MRDA Rankings Algorithm using Linear Regression](https://grimesbot.github.io/MRDA_LinearRegression_UI)

Summary
---------------
This repository produces rankings for the MRDA based on the [2025 WFTDA Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf) which uses a statistical method called [Linear Regression](https://en.wikipedia.org/wiki/Linear_regression) to calculate rankings points using MRDA sanctioned game score data from 2023 and onward.

Disclaimer
---------------
This algorithm is not final and this is NOT an official source of MRDA Rankings. Per MRDA's Policies and Procedures, "Rankings will be determined by a Rankings Panel," and this algorithm is a tool to help the five members of the Rankings Panel make informed and prompt decisions. Any algorithm has limitations and the Rankings Panel will use their experience and judgement to take into account those limitations and the human elements of the sport. This tool and it's source code are publicly available for transparency and informational purposes, use with discretion.

Simple Explanation 
---------------
Other algorithms that have been used to aid in determining MRDA rankings such as Elo Rating or the Average Ranking Points based on WFTDA's 2023 algorithm calculate the contributions of each game based on the current standing of each team at the time of the game. Instead, this algorithm evaluates all games played in the rankings period, regardless of the order games are played.

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
-   **Error**: We are representing the [standard error](https://en.wikipedia.org/wiki/Standard_error) of the linear regression statistical method as a percentage (relative standard error) using ± and % symbols and error bars on team's historical ranking point charts. This highlights the uncertainty for newer teams and teams who've played fewer games.
-   **Active Status**: Teams must play a minimum of 3 MRDA Sanctioned games against at least 2 unique opponents in the Ranking Period to achieve Active Status. Teams must maintain Active Status to earn a Rank.
-   **Postseason Eligible**: Teams must maintain Active Status and play a minimum of 5 MRDA Sanctioned games in the Ranking Period to be eligible for invites to postseason tournaments. This measure must be met in both the June AND September Ranking periods of that year to qualify/maintain their invite. Teams who have three or fewer active MRDA Member Leagues located within one thousand (1,000) miles or fifteen hundred (1,500) kilometers are exempt from this additional 5 game requirement.

Frequently Asked Questions
---------------
### How can I find the expected score of a game?
The predicted score ratio of a game is simply the ratio of the competing teams Ranking Points at the time of the game. For example, to find the predicted score ratio of a game between Red team and Blue team on Saturday, August 23rd 2025, we need the most recent Ranking Points of Red team and Blue team which would be from Wednesday, August 20th, 2025. To find the expected score ratio we divide the Red team Ranking Points by Blue team Ranking Points. If Red team's Ranking Points were 450 and Blue team's Ranking Points were 300, the expected score ratio would be 450 / 300 = 1.5:1

### Can I calculate how the outcome of a single game will impact my team's rankings?
No, not anymore. This was possible with other algorithms in the past, but it's not possible with this algorithm because calculations depend on every other game too, not just the one game in isolation. But generally, obtaining a better score ratio than predicted (see above) will tend to increase your ranking.

However, you won't need to wait a month to see how a game impacts your ranking. The Web UI here should reflect game results and their ranking impact within two hours after they are entered in MRDA Central, even before scores are validated. We include score reports in "Approved" and "Waiting for Documents" from the last 60 days assuming sanctioning requirements will be met in good faith.

### How are new teams handled?
Previously, other algorithms have used something like a "Seeding Game" to determine a new team's starting point: the result of their first game determines their starting point with no impact on their opponent. This has been problematic when the result of their first game does not accurately rank the new team which happens when the new team's opponent is over/under performing or when teams are geographically isolated. One game is not enough data to accurately rank a team, and this inaccurate ranking could have a profound impact on the teams they play after their seeding game.

The order in which games are played does not matter in the linear regression algorithm, so a new team's Rank is based on at least 3 games to achieve Active Status or at least 5 games to be Postseason Eligible. The impact on the new team's opponents is minimal since there's no difference between being a new team's first opponent, third or fifth opponent since the order of games played doesn't matter. 

### How are teams returning from hiatus treated?
When calculating rankings, teams who are not included in the Seeding Rankings are treated as a new team. This means if a team does not play in a 12 month period, they will be treated as a new team when they return.

Previously, other algorithms have not done anything to handle hiatus or decay. Teams could take a hiatus of a year or more and return with the same ranking points or rating as when they last played. This could have a profound impact on future opponents because the ranking of the returning team could be very inaccurate.

### Is there a ratio cap?
No, but games with a score ratio greater than 4:1 have less weight. These blowouts are less reliable data, so we use a formula to scale the weight based on ratio. For reference, a score ratio of 4:1 or less is weighted at 100%, 5:1 is weighted at 58%, 6:1 at 33%, 7:1 at 19%, and 8:1 at 11%, etc.

### Do we treat postseason games or older games differently?
No, all games played within the Ranking Period are weighted using the same logic (see "ratio cap" above). A Champs game from 11 months ago is treated equally to a regular season game played yesterday.

Implementation 
---------------
LinearRegression.py gets 2023 game data hardcoded in Python in GameList_history.py and merges it with 2024 and newer game data retrieved from the MRDA Central API. Using this data it calculates Rankings for each Wednesday starting October 25th 2023 (after Western Hemisphere Cup) through the upcoming ranking deadline date using the [Weighted Least Squares](https://en.wikipedia.org/wiki/Weighted_least_squares) method of the [StatsModel](https://www.statsmodels.org/stable/index.html) Python package. LinearRegression.py writes all of this team, game and historical ranking data to JavaScript files for visualization purposes in the local Web UI. It also writes all of these teams, games and historical ranking results to JSON files for external use. It is run every two hours via GitHub Actions and will recalculate all rankings whenever game data from the MRDA Central API has changed, accounting for newly added score reports and historical score corrections.

The Web UI at index.html displays the results in a chart and a table. It also calculates Active Status and Postseason Eligibility using games data produced by LinearRegression.py. Clicking on a team displays their Ranking Points history with error bars. It also shows data points for individual games played and the Game Ranking Points they would have earned in the previous Average Ranking Points algorithm adapted from WFTDA's 2023 system. Game data points will appear above the Ranking Point line the more the team exceeded the predicted score ratio at the time and or below the line the more they underperformed compared to the expected score ratio.

Advanced FAQ for the Nerds!
---------------
### When and how do we start calculating rankings? What do we use for Seeding Ranking after the pandemic?
We have sanctioned game score data going back to late April of 2023. Western Hemisphere Cup is a logical place after which to start calculating Rankings (Wednesday, October 25th 2023), as it marks the first postseason event after the pandemic break. However, with only one season of data we do not have the benefit of any historical data to use as Seeding Rankings. We run the linear regression method without seeding data following the implementation section on page 11 of the [2025 WFTDA Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf) which omits virtual games and scales the Ranking Point results by 100.

Using this method, our rankings will be based entirely on historical sanctioned scores and we do not need to resort to any guesswork or an unreliable or out-of-date source like Flat Track Stats. However, without Seeding Rankings and a common virtual opponent connecting teams the results are less accurate, so we use all data going back to April of 2023 in all of these calculations to improve accuracy. For example, September 2024 Rankings would include games from April '23 through August of '24 which is 16 months. This is longer than the typical 12 month ranking period, but the results will only ever be used as Seeding Rankings to make future calculations (e.g. September 2025) more accurate and never to determine any Rankings on its own.

Starting Wednesday, October 23rd, 2024, a year after WHC and once we have global crossover data from 2024 Champs, we start using the previous years' results as Seeding Rankings. December 2024 rankings will be based on games from Dec '23 - Dec '24 and use the Dec '23 rankings as Seeding Rankings which were calculated without historical data. Starting Wednesday, October 22nd, 2025, two years after WHC, all Rankings and the Seeding Rankings will be based on calculations which used virtual games and seeding data for highest accuracy.

### Do we reduce the weight of virtual games once a team has played 5 close games to reduce the impact of seeding?
No, 5 close games is WFTDA's postseason eligibility requirement. We use MRDA's postseason eligibility requirement which is 5+ games in 12 months (or 3+ for geographically isolated teams) against at least two different opponents, it doesn't matter if the score is "close" (< 4:1 ratio). Once a team is postseason eligible, we set the virtual game's weight to near zero (1/1,000,000) so the team's ranking points are only determined by their actual games when deciding postseason invites.