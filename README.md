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
No. You may notice that WFTDA does this in their [2025 Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf), but we found this had an unexpected and inconsistent impact on MRDA rankings with our rolling 12 month season as opposed to WFTDA's set season. Particularly with geographically isolated teams who may never play 5 games in the Rankings Period, close or not. We want to treat teams consistently.

### How does this compare to other algorithms?
Using the Mean Absolute Log Error (MALE) as described in Appendix B of the [2025 WFTDA Rankings Algorithm update proposal](/2025%20WFTDA%20Rankings%20Algorithm%20update%20proposal.pdf) we can compare the accuracy of algorithms. (They admittedly used a "forced anagram" of MEAL for what I assume are very WFTDA reasons). Looking at all games from December 4th, 2024 onward (August 20th, 2025 as of writing), here are the % error, lower numbers being better:

| Algorithm                                            | Relative Standard Error |
| ---------------------------------------------------- | ----------------------- |
| Linear Regression Ranking Points                     | 65.19%                  |
| Average Ranking Points (2023 WFTDA adapted for MRDA) | 71.46%                  |
| Elo Rating                                           | 72.81%                  |

As you can see, this algorithm has 6.27%-7.62% lower error in predicting scores than the algorithms previously used to aid in MRDA rankings. It is also worthwhile to note that the Average Ranking Points algorithm in this comparison had the benefit of retroactively adjusting the initial rankings (e.g. seeding game results) of the new French and UK teams once we had crossover data to more accurately place them. Even so, the Linear Regression algorithm is still 6.27% more accurate without manual intervention or retroactive adjustment which are not possible since this algorithm only uses sanctioned score data.

### How would results compare to previous rankings proposed by the Rankings Panel and approved by membership vote?

#### December 2024 (Q4) Rankings
| Voted Rankings (Rankings Panel) | Linear Regression Rankings | Ranking Points with Error | Rank Difference |
| ------------------------------- | -------------------------- | -------------------------- | --------------- |
| 1 - Saint Louis Gatekeepers (A) | 1 - Saint Louis Gatekeepers (A) | 672.49 ± 18.77% | 0 |
| 2 - Denver Ground Control (A) | 2 - Denver Ground Control (A) | 474.4 ± 19.66% | 0 |
| 3 - Magic City Misfits (A) | 3 - Magic City Misfits (A) | 392.76 ± 18.19% | 0 |
| 4 - Tyne and Fear Roller Derby (A) | 4 - Tyne and Fear Roller Derby (A) | 289.08 ± 16.93% | 0 |
| 5 - Borderland Bandits Roller Derby (A) | 5 - Borderland Bandits Roller Derby (A) | 279.2 ± 19.73% | 0 |
| 6 - Concussion Roller Derby (A) | 6 - Manchester Roller Derby (A) | 241.45 ± 18.79% | +1 |
| 7 - Manchester Roller Derby (A) | 7 - Concussion Roller Derby (A) | 211.93 ± 15.7% | -1 |
| 8 - The Inhuman League (A) | 8 - San Diego Aftershocks (A) | 199.38 ± 17.8% | +1 |
| 9 - San Diego Aftershocks (A) | 9 - The Inhuman League (A) | 165.67 ± 16.92% | -1 |
| 10 - Carolina Wreckingballs (A) | 10 - Carolina Wreckingballs (A) | 156.73 ± 17.66% | 0 |
| 11 - Race City Rebels (A) | 11 - Disorder (A) | 144.07 ± 20.03% | +1 |
| 12 - Disorder (A) | 12 - Race City Rebels (A) | 143.17 ± 15.27% | -1 |
| 13 - Casco Bay Roller Derby (A) | 13 - Puget Sound Outcast Derby (A) | 102.57 ± 16.56% | +1 |
| 14 - Puget Sound Outcast Derby (A) | 14 - Casco Bay Roller Derby (A) | 95.9 ± 19.71% | -1 |
| 15 - Chinook City Roller Derby (A) | 15 - Toronto Mens Roller Derby (A) | 92.24 ± 17.55% | +1 |
| 16 - Toronto Mens Roller Derby (A) | 16 - Chinook City Roller Derby (A) | 84.53 ± 18.42% | -1 |
| 17 - Pittsburgh Roller Derby (A) | 17 - Pittsburgh Roller Derby (A) | 84.38 ± 16.67% | 0 |
| 18 - Philadelphia Hooligans (A) | 18 - Chicago Bruise Brothers (A) | 81.21 ± 19.62% | +1 |
| 19 - Chicago Bruise Brothers (A) | 19 - Philadelphia Hooligans (A) | 77.18 ± 16.92% | -1 |
| 20 - Kent Mens Roller Derby (A) | 20 - Austin Anarchy (A) | 59.1 ± 20.63% | +1 |
| 21 - Austin Anarchy (A) | 21 - Saint Louis Gatekeepers (B) | 57.07 ± 31.32% | +1 |
| 22 - Saint Louis Gatekeepers (B) | 22 - Kent Mens Roller Derby (A) | 52.41 ± 21.69% | -2 |
| 23 - South Wales Silures (A) | 23 - Philadelphia Hooligans (B) | 40.14 ± 33.28% | +3 |
| 24 - Tyne and Fear Roller Derby (B) | 24 - South Wales Silures (A) | 33.87 ± 33.97% | -1 |
| 25 - Flour City Roller Derby (A) | 25 - Flour City Roller Derby (A) | 32.36 ± 24.22% | 0 |
| 26 - Philadelphia Hooligans (B) | 26 - Tyne and Fear Roller Derby (B) | 28.25 ± 42.41% | -2 |
| 27 - Pittsburgh Roller Derby (B) | 27 - Detroit Mens Roller Derby (A) | 20.31 ± 24.04% | +2 |
| 28 - Cleveland Guardians Roller Derby (A) | 28 - Pittsburgh Roller Derby (B) | 19.22 ± 28.39% | -1 |
| 29 - Detroit Mens Roller Derby (A) | 29 - Terminus Roller Derby (A) | 18.9 ± 24.67% | +1 |
| 30 - Terminus Roller Derby (A) | 30 - Cleveland Guardians Roller Derby (A) | 18.44 ± 22.45% | -2 |

#### March 2025 (Q1) Rankings
| Voted Rankings (Rankings Panel) | Linear Regression Rankings | Ranking Points with Error | Rank Difference |
| ------------------------------- | -------------------------- | -------------------------- | --------------- |
| 1 - Saint Louis Gatekeepers (A) | 1 - Saint Louis Gatekeepers (A) | 757.44 ± 17.64% | 0 |
| 2 - Denver Ground Control (A) | 2 - Denver Ground Control (A) | 551.69 ± 18.51% | 0 |
| 3 - Magic City Misfits (A) | 3 - Magic City Misfits (A) | 471.94 ± 18.7% | 0 |
| 4 - Tyne and Fear Roller Derby (A) | 4 - Tyne and Fear Roller Derby (A) | 390.14 ± 17.22% | 0 |
| 5 - Borderland Bandits Roller Derby (A) | 5 - Borderland Bandits Roller Derby (A) | 373.73 ± 20.13% | 0 |
| 6 - Concussion Roller Derby (A) | 6 - Manchester Roller Derby (A) | 284.65 ± 18.84% | +1 |
| 7 - Manchester Roller Derby (A) | 7 - Roller Derby Toulouse (A) | 274.69 ± 57.59% | +4 |
| 8 - The Inhuman League (A) | 8 - Concussion Roller Derby (A) | 243.18 ± 18.12% | -2 |
| 9 - San Diego Aftershocks (A) | 9 - San Diego Aftershocks (A) | 215.2 ± 16.92% | 0 |
| 10 - Carolina Wreckingballs (A) | 10 - Carolina Wreckingballs (A) | 203.67 ± 21.99% | 0 |
| 11 - Roller Derby Toulouse (A) | 11 - The Inhuman League (A) | 173.28 ± 16.45% | -3 |
| 12 - Race City Rebels (A) | 12 - Disorder (A) | 159.55 ± 18.78% | +1 |
| 13 - Disorder (A) | 13 - Race City Rebels (A) | 155.84 ± 14.36% | -1 |
| 14 - Casco Bay Roller Derby (A) | 14 - Panam Squad (A) | 113.23 ± 42.23% | +10 |
| 15 - Pittsburgh Roller Derby (A) | 15 - Casco Bay Roller Derby (A) | 101.35 ± 18.54% | -1 |
| 16 - Chinook City Roller Derby (A) | 16 - Puget Sound Outcast Derby (A) | 94.15 ± 20.38% | +2 |
| 17 - Toronto Mens Roller Derby (A) | 17 - Pittsburgh Roller Derby (A) | 91.5 ± 18.79% | -2 |
| 18 - Puget Sound Outcast Derby (A) | 18 - Toronto Mens Roller Derby (A) | 90.65 ± 16.16% | -1 |
| 19 - Philadelphia Hooligans (A) | 19 - Chicago Bruise Brothers (A) | 87.92 ± 18.72% | +1 |
| 20 - Chicago Bruise Brothers (A) | 20 - Chinook City Roller Derby (A) | 86.4 ± 17.92% | -4 |
| 21 - Kent Mens Roller Derby (A) | 21 - Philadelphia Hooligans (A) | 83.3 ± 16.29% | -2 |
| 22 - Austin Anarchy (A) | 22 - Saint Louis Gatekeepers (B) | 61.03 ± 29.43% | +1 |
| 23 - Saint Louis Gatekeepers (B) | 23 - Austin Anarchy (A) | 59.78 ± 19.35% | -1 |
| 24 - Panam Squad (A) | 24 - Kent Mens Roller Derby (A) | 58.13 ± 19.92% | -3 |
| 25 - South Wales Silures (A) | 25 - South Wales Silures (A) | 43.1 ± 24.1% | 0 |
| 26 - Tyne and Fear Roller Derby (B) | 26 - Tyne and Fear Roller Derby (B) | 40.28 ± 25.36% | 0 |
| 27 - Flour City Roller Derby (A) | 27 - Philadelphia Hooligans (B) | 34.53 ± 28.83% | +1 |
| 28 - Philadelphia Hooligans (B) | 28 - Flour City Roller Derby (A) | 29.72 ± 20.09% | -1 |
| 29 - Pittsburgh Roller Derby (B) | 29 - Detroit Mens Roller Derby (A) | 17.92 ± 20.88% | +2 |
| 30 - Cleveland Guardians Roller Derby (A) | 30 - Pittsburgh Roller Derby (B) | 17.15 ± 22.37% | -1 |
| 31 - Detroit Mens Roller Derby (A) | 31 - Terminus Roller Derby (A) | 16.63 ± 21.66% | +1 |
| 32 - Terminus Roller Derby (A) | 32 - Cleveland Guardians Roller Derby (A) | 14.33 ± 19.24% | -2 |

#### June 2025 (Q2) Rankings
| Voted Rankings (Rankings Panel) | Linear Regression Rankings | Ranking Points with Error | Rank Difference |
| ------------------------------- | -------------------------- | -------------------------- | --------------- |
| 1 - Saint Louis Gatekeepers (A) | 1 - Roller Derby Toulouse (A) | 827.69 ± 34.56% | +1 |
| 2 - Roller Derby Toulouse (A) | 2 - Saint Louis Gatekeepers (A) | 655.89 ± 18.51% | -1 |
| 3 - Tyne and Fear Roller Derby (A) | 3 - Denver Ground Control (A) | 480.71 ± 16.81% | +2 |
| 4 - Concussion Roller Derby (A) | 4 - Nordiks de Touraine (A) | 459.12 ± 39.92% | +3 |
| 5 - Denver Ground Control (A) | 5 - Tyne and Fear Roller Derby (A) | 451.37 ± 18.6% | -2 |
| 6 - Magic City Misfits (A) | 6 - Concussion Roller Derby (A) | 439.79 ± 18.11% | -2 |
| 7 - Nordiks de Touraine (A) | 7 - Southern Discomfort Roller Derby (A) | 394.78 ± 26.36% | +3 |
| 8 - Orcet Roller Derby (A) | 8 - Magic City Misfits (A) | 373.5 ± 16.75% | -2 |
| 9 - Roller Derby Nantes Atlantique (A) | 9 - Orcet Roller Derby (A) | 367.34 ± 41.53% | -1 |
| 10 - Southern Discomfort Roller Derby (A) | 10 - Roller Derby Nantes Atlantique (A) | 326.44 ± 32.81% | -1 |
| 11 - Carolina Wreckingballs (A) | 11 - Panam Squad (A) | 226.25 ± 35.61% | +12 |
| 12 - Race City Rebels (A) | 12 - Borderland Bandits Roller Derby (A) | 201.02 ± 20.88% | +4 |
| 13 - The Inhuman League (A) | 13 - Carolina Wreckingballs (A) | 200.19 ± 25.84% | -2 |
| 14 - Disorder (A) | 14 - The Inhuman League (A) | 200.1 ± 18.69% | -1 |
| 15 - Puget Sound Outcast Derby (A) | 15 - Race City Rebels (A) | 191.79 ± 16.45% | -3 |
| 16 - Borderland Bandits Roller Derby (A) | 16 - San Diego Aftershocks (A) | 174.38 ± 18% | +3 |
| 17 - Pittsburgh Roller Derby (A) | 17 - Disorder (A) | 170.76 ± 18.35% | -3 |
| 18 - Chicago Bruise Brothers (A) | 18 - Puget Sound Outcast Derby (A) | 161.37 ± 20.01% | -3 |
| 19 - San Diego Aftershocks (A) | 19 - Pittsburgh Roller Derby (A) | 140.6 ± 18.74% | -2 |
| 20 - Wirral Roller Derby (A) | 20 - Chicago Bruise Brothers (A) | 139.06 ± 20.48% | -2 |
| 21 - Casco Bay Roller Derby (A) | 21 - Dallas Derby Devils (A) | 121.53 ± 24.22% | +3 |
| 22 - Philadelphia Hooligans (A) | 22 - Philadelphia Hooligans (A) | 112.45 ± 20.29% | 0 |
| 23 - Panam Squad (A) | 23 - Casco Bay Roller Derby (A) | 108.35 ± 18.48% | -2 |
| 24 - Dallas Derby Devils (A) | 24 - Wirral Roller Derby (A) | 102.61 ± 33.87% | -4 |
| 25 - Austin Anarchy (A) | 25 - Austin Anarchy (A) | 86.57 ± 20.26% | 0 |
| 26 - Kent Mens Roller Derby (A) | 26 - Saint Louis Gatekeepers (B) | 74.05 ± 21.88% | +2 |
| 27 - Toronto Mens Roller Derby (A) | 27 - Kent Mens Roller Derby (A) | 73.01 ± 20.54% | -1 |
| 28 - Saint Louis Gatekeepers (B) | 28 - Toronto Mens Roller Derby (A) | 68.6 ± 19.94% | -1 |
| 29 - Crash Test Brummies (A) | 29 - Tampa Roller Derby (A) | 63.92 ± 26.49% | +3 |
| 30 - South Wales Silures (A) | 30 - Crash Test Brummies (A) | 53.11 ± 28.4% | -1 |
| 31 - Tyne and Fear Roller Derby (B) | 31 - South Wales Silures (A) | 51.12 ± 28.1% | -1 |
| 32 - Tampa Roller Derby (A) | 32 - Tyne and Fear Roller Derby (B) | 49.66 ± 23.26% | -1 |
| 33 - Cleveland Guardians Roller Derby (A) | 33 - Flour City Roller Derby (A) | 38.11 ± 18.1% | +1 |
| 34 - Flour City Roller Derby (A) | 34 - San Diego Aftershocks (B) | 37.44 ± 31.5% | +3 |
| 35 - Philadelphia Hooligans (B) | 35 - Philadelphia Hooligans (B) | 35.44 ± 25.91% | 0 |
| 36 - Pittsburgh Roller Derby (B) | 36 - Cleveland Guardians Roller Derby (A) | 33.79 ± 18.92% | -3 |
| 37 - San Diego Aftershocks (B) | 37 - Pittsburgh Roller Derby (B) | 26.72 ± 21.59% | -1 |
| 38 - Detroit Mens Roller Derby (A) | 38 - Detroit Mens Roller Derby (A) | 25.3 ± 26.08% | 0 |
| 39 - Terminus Roller Derby (A) | 39 - Terminus Roller Derby (A) | 23.5 ± 21.4% | 0 |