MRDA Rankings Algorithm using Linear Regression
===============
[Live MRDA Rankings Algorithm using Linear Regression](https://grimesbot.github.io/MRDA_LinearRegression_UI)

Summary
---------------
This repository calculates rankings for the [MRDA](https://mrda.org/) using a statistical method called [Linear Regression](https://en.wikipedia.org/wiki/Linear_regression) to calculate rankings points representing the relative strength of each team. This is a variation of a method described by [Massey (1997)](https://masseyratings.com/theory/massey97.pdf) which was designed for American college football and was included in the NCAA's Bowl Championship Series (BCS) ranking formula. It was previously implemented for roller derby by [Sam Skipsey](https://aoanla.pythonanywhere.com/SRDRank.html) and later refined and adopted by the [WFTDA in 2025](https://static.wftda.com/files/competition/wftda-rankings-policy-and-algorithm.pdf).

This implementation for the MRDA is similar to WFTDA's and was originally developed referring to the [2025 WFTDA Rankings Algorithm update proposal](https://drive.google.com/file/d/1WnOy_XUK8WmXbpAjqJCy_mJN0WdKCNG8/view) which is further explained in the very informative [2025 WFTDA Rankings Algorithm Explained](https://docs.google.com/document/d/e/2PACX-1vS2Va64tTxNligHExRfUGgzEkn4wO8RM5-3Q5J6I3aeuuvCwP-SzfTEnqifJrWWZSXPplKEqeFrEYNs/pub) document. This implementation is different in a few key ways to fit the specific needs of the MRDA, mostly regarding seasonality and regions, but WFTDA's documentation is incredibly useful in explaining and understanding the underlying mathematics.

Disclaimer
---------------
This algorithm is not final and this is NOT an official source of MRDA Rankings. Per MRDA's Policies and Procedures, "Rankings will be determined by a Rankings Panel," and this algorithm is a tool to help the five members of the Rankings Panel make informed and prompt decisions. Any algorithm has limitations and the Rankings Panel will use their experience and judgement to take into account those limitations and the human elements of the sport. This tool and it's source code are publicly available for transparency and informational purposes, use with discretion.

Simple Explanation 
---------------
Other algorithms that have been used to aid in determining MRDA rankings such as Elo Rating or the Average Ranking Points based on WFTDA's 2023 algorithm calculate the contributions of each game in chronological order, based on the current standing of each team at the time the game is played. Instead, this algorithm evaluates all games played in the rankings period, regardless of the order games are played.

For example, if Red team played Blue team yesterday, then the Blue team plays Green team today, today's game provides data about Blue and Green teams, but it also puts *yesterday’s* game in context so that we now know more about the Red team too. The advantage of this algorithm is that it will re-evaluate yesterday's game with the new information.

Terminology 
---------------
-   **Ranking Points**: A points value calculated by the ranking algorithm which represent the relative strength of each team. The ratio between the ranking points of two teams indicates the predicted score ratio of a game played by those two teams. For example, if Red team has double the ranking points of Blue team, Red team is predicted to win a game between the teams with double the score.
-   **Ranking**: An ordered list of eligible teams by their relative strength (Ranking Points).
-   **Rank**: The position eligible teams have within a given Ranking.
-   **Ranking Deadline Dates**: The MRDA produces and publishes an official ranking quarterly based on the following schedule. This algorithm calculates rankings for every Wednesday for informational, historical and visualization purposes.
    -   *First Wednesday of March*: Q1 Rankings 
    -   *First Wednesday of June*: Q2 Rankings, Postseason Tournament Invites
    -   *First Wednesday of September*: Q3 Rankings, Championships Seeding
    -   *First Wednesday of December*: Q4 Rankings
-   **Ranking Period**: The period of time in which MRDA sanctioned games played are used to determine rankings. Generally considered the 12 months before the Ranking Deadline Date, it includes MRDA sanctioned games played on or after last year's corresponding Ranking Deadline Date up to the current Ranking Deadline Date. For example, The Q2-2028 Rankings Period includes games played before the first Wednesday of June 2028 (2028-6-7) and on or after the first Wednesday of June 2027 (2027-6-2). This is a few days more than 12 months, but if we used a strict rolling 12 month ranking period, games on the weekend of June 4-6, 2027 would not count for postseason invites in either 2027 or 2028.
-   **Seed**: A team's Ranking Points from last season which are used to anchor this season's rankings. Since the MRDA generally uses a rolling 12 month season, we are using the Ranking Points calculated for last year's Ranking Deadline Date (see Ranking Period). For example, when calculating Rankings for the 3rd Wednesday of August 2025, we would use the Rankings calculated for the 3rd Wednesday of August 2024 as the Seed data.
-   **Virtual Game**: An imaginary game that anchors a team’s Ranking Points to their Seed. Virtual games connect all existing teams to a common *virtual opponent*.  This is necessary since teams choose their opponents freely and we cannot guarantee all teams will be connected by either a direct matchup or even indirectly by a chain of opponents within a Ranking Period.
-   **Error**: We are representing the [standard error](https://en.wikipedia.org/wiki/Standard_error) of the linear regression statistical method as a percentage (relative standard error) using ± and % symbols and error bars on team's historical ranking point charts. This highlights the uncertainty for newer teams and teams who've played fewer games.
-   **Active Status**: Charter teams must play a minimum of 3 MRDA Sanctioned games against at least 2 unique opponents in the Ranking Period to achieve Active Status. This measure must be met every Rankings Period for the charter team to be Ranked.
-   **Postseason Eligible**: To be eligible for MRDA Postseason Tournaments, the charter team must maintain Active Status and play a minimum of 5 MRDA sanctioned games within both the Q2 and Q3 Ranking Periods of that year to qualify/maintain their invite.
    -   **Distance Clause**: MRDA Member Leagues who have three (3) or fewer active MRDA Member Leagues located within one thousand (1,000) miles or sixteen hundred (1,600) kilometers are exempt from meeting a Postseason five game minimum.
-   **Game Decay**: For the purposes of Active Status and Postseason Eligibility; games taking place at MRDA Postseason Tournaments will expire after the following March (Q1) ranking deadline. These games are still used for rankings determination based for the entire Ranking Period.
-   **Forfeit Ranking Penalty**: If a team has forfeited a game in the Ranking Period, the forfeiting team will move down two rankings spots per forfeit while the non-forfeiting team will not have their rankings affected or moved. This ranking tool enforces the forfeit ranking penalty automatically and it is indicated with an asterisk after the forfeiting team's name.

Frequently Asked Questions
---------------
### How can I find the expected score of a game?
The predicted score ratio of a game is simply the ratio of the competing teams Ranking Points at the time of the game. For example, to find the predicted score ratio of a game between Red team and Blue team on Saturday, August 23rd 2025, we need the most recent Ranking Points of Red team and Blue team which would be from Wednesday, August 20th, 2025. To find the expected score ratio we divide the Red team Ranking Points by Blue team Ranking Points. If Red team's Ranking Points were 450 and Blue team's Ranking Points were 300, the expected score ratio would be 450 / 300 = 1.5:1

This tool also includes an *Expected Score Ratio Calculator* which calculates the predicted score ratio for a game between two teams on a given date, as well as an *Upcoming Games* table which displays the predicted score ratios for future sanctioned games scheduled in MRDA Central.

### Can I calculate how the outcome of a single game will impact my team's rankings?
No, not anymore. This was possible with other algorithms in the past, but it's not possible with this algorithm because calculations depend on every other game too, not just the one game in isolation. But generally, obtaining a better score ratio than predicted (see above) will tend to increase your ranking.

However, you won't need to wait a month to see how a game impacts your ranking. The Web UI here should reflect game results and their ranking impact within two hours after they are entered in MRDA Central, even before scores are validated: We include score reports in "Approved" and "Waiting for Documents" assuming sanctioning requirements will be met in good faith.

### How are new teams handled?
New teams are treated the same as existing teams but without a Virtual Game because they do not have Ranking Points from last season to use as a Seed. Their ranking points will be based on all the games they play in the Ranking Period without the need for a special *seeding game*.

Previously, other algorithms used the concept of a *seeding game* to determine a new team's starting point: the result of their first game determines their starting point with no impact on their opponent's ranking points. This has been problematic because established teams have no incentive to play a new team since there is no potential to improve their ranking, and when they do the established team has little incentive to perform or play their best players. This would often result in new teams being inaccurately ranked based on an unreliable *seeding game* which could have profound impact on subsequent opponents.

One game is not nearly enough data to determine a team's relative strength, particularly when that game can be unreliable data. With linear regression, a new team's Ranking Points are based on all games they played in the Ranking Period which is usually at least 3 to be Ranked or 5 to be Postseason Eligible, giving us a much more accurate representation of the new team's relative strength.

Established teams also have incentive to play and perform well against new teams because there's no difference between being the new team's first opponent or fifth opponent. How an established team performs against the new team **can and will** affect both team's ranking points as the season unfolds and we see how that initial game compares to the new team's subsequent games.

### How are teams returning from hiatus treated?
When calculating rankings, teams who do not have a Seed are treated as a new team. This means if a team does not play in a 12 month period, they will be treated as a new team when they return.

Previously, other algorithms have not handled hiatus or decay. Teams could take a hiatus of a year or more and return with the same ranking points or rating as when they last played. This could have a profound impact on future opponents because the ranking points of the returning team could be very inaccurate.

### Is there a ratio cap?
No, but games with a score ratio greater than 4:1 have less weight. These blowouts provide less accurate information about the relative strengths of the teams, so we reduce the weight based on ratio greater than 4:1 with the formula 3^((4-ratio/2)). For reference, a score ratio of 4:1 or less is weighted at 100%, 5:1 is weighted at 58%, 6:1 at 33%, 7:1 at 19%, and 8:1 at 11%, etc.

This increases the accuracy of the algorithm overall and allows teams to test different strategy or field different skaters in these scenarios than they might if they felt like they needed to squeeze every point out of every jam.

### Do we treat postseason games or older games differently?
No, all games played within the Ranking Period are weighted using the same logic (see "ratio cap" above). A Champs game from 11 months ago is treated the same as a regular season game played yesterday.

Implementation 
---------------
mrda_data.py gets 2024 and newer game data retrieved from the MRDA Central API and merges it with 2023 game data hardcoded in game_history.py. Using this data, linear_regression.py calculates Rankings for each Wednesday starting October 25th 2023 (after Western Hemisphere Cup) through the upcoming ranking deadline date using the [Weighted Least Squares](https://en.wikipedia.org/wiki/Weighted_least_squares) method of the [StatsModel](https://www.statsmodels.org/stable/index.html) Python package. Python writes all of this team, game and historical ranking data to JavaScript files for visualization purposes in the Web UI. It also writes all of these teams, games and historical ranking results to JSON files for external use. It is run every two hours via GitHub Actions and will recalculate all rankings whenever game data from the MRDA Central API has changed, accounting for newly added score reports and historical score corrections.

The Web UI at index.html displays the results in a chart and a table. Clicking on a team displays a chart illustrating their Ranking Points history with error bars and a table of their game history. The table shows expected and actual score ratios based on the Ranking Points of the teams at the time of each game and the team's ranking points from the Wednesday before and after each game. Data points for each game are displayed on the chart for informational and visualization purposes based on the Game Ranking Points they would have earned in the previous Average Ranking Points algorithm adapted from WFTDA's 2023 system; Game data points will appear above the Ranking Point line the more the team exceeded expectations or below the line the more they underperformed compared to the expected score ratio at the time of the game.

Advanced FAQ for the Nerds!
---------------
### When and how do we start calculating rankings? What do we use for Seed data after the pandemic?
We have sanctioned game score data going back to late April of 2023. Western Hemisphere Cup is a logical place after which to start calculating historical Rankings (Wednesday, October 25th 2023), as it marks the first postseason event after the pandemic break. However, with only one season of data we do not have the benefit of any historical data to use as Seed data. We run the linear regression method without any seed data following the implementation section on page 11 of the [2025 WFTDA Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf) which omits virtual games and scales the Ranking Point results by 100.

Using this method, our rankings will be based entirely on historical sanctioned scores and we do not need to resort to any guesswork or an unreliable data source like Flat Track Stats. However, without Seed data and a common *virtual opponent* connecting teams, the results are less accurate. So we use all data going back to April of 2023 in all of these calculations to improve accuracy. For example, September 2024 Rankings would include games from April '23 through August of '24 which is 16 months. This is longer than the typical 12 month ranking period, but the results will only ever be used as Seed data to make future calculations (e.g. September 2025) more accurate and never to determine any Rankings on its own.

Starting Wednesday, October 23rd, 2024, a year after WHC and once we have global crossover data from 2024 Champs, we start using the previous years' results as Seed data. December 2024 rankings will be based on games from Dec '23 - Dec '24 and use the Dec '23 rankings as Seed data which were calculated without Seed data. Starting Wednesday, October 22nd, 2025, two years after WHC, all Rankings and the previous years' Seed data are calculated using Virtual Games for highest accuracy.

### How much does your Seed (last season's Ranking Points) impact this season's rankings?
It is important in any Weighted Least Squares sports ranking implementation that all teams are connected through games, meaning all teams have either played each other directly or there is some chain of teams that have played each other to connect them indirectly. Since MRDA teams can choose their opponents freely, we cannot guarantee all teams will be connected in a Ranking Period. To solve this problem, we introduce Virtual Games: we add a game against a *virtual team* for all returning teams, using their Seed as the score. **Virtual Games have a weight of 25%.**

This is the biggest difference from WFTDA's rankings algorithm: WFTDA use a weight of 100% for Virtual Games until a team has played at least 5 close games to become postseason eligible, then it becomes near-zero (1/10,000%). However, WFTDA use a set season tied to specific calendar months, so early in the season their ranking will be anchored by last season's Seed data until the season has matured and most teams have played at least five close games. The MRDA uses rolling 12 month Ranking Periods, so we're always using a full, mature season of 12 months of games. We don't want to use 100% weight for Virtual Games like WFTDA does for a partial season before teams have played enough games to be postseason eligible.

On the other hand, we cannot remove the Virtual Games or set them to a near-zero weight either. The MRDA produces global rankings and does not separate into regions, so we still need these Virtual Games to make sure all teams are connected across multiple continents, particularly the many teams who may not have played any intercontinental games by being invited to Champs, for example. The WFTDA separate their ranking calculations by region, so by the time their season has matured and most teams in a region have played at least 5 close games to become postseason eligible, it's reasonably safe to say that all teams in the region will be connected, either by a direct matchup or an indirect chain of opponents. So WFTDA's regional rankings can safely remove these Virtual Games or set them to near-zero weight, MRDA's global rankings cannot.

25% weight for Virtual Games is a balance to connect all MRDA teams globally but still prioritize the results of games played in the current Ranking Period.