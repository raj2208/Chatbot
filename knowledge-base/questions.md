# RAG Test Questions

These questions are designed to test the chatbot once RAG is implemented.
Each question maps to specific facts in the knowledge base so you can verify
whether the right chunks were retrieved and the answer is grounded in the docs.

The questions are grouped by difficulty:
- **Simple** — single fact lookup from one file
- **Medium** — requires combining two facts from the same file
- **Hard** — requires connecting information across multiple files
- **Trick** — asks about something NOT in the knowledge base (correct answer: "I don't know")

---

## Simple — Single Fact Lookup

1. Who is the CEO of Elanco?
2. In which city is Elanco's headquarters located?
3. When was Elanco founded?
4. What is the name of Elanco's flea and tick product?
5. How many veterinary clinics are registered on the VetConnect Portal?
6. What is Elanco's primary cloud provider?
7. What is Elanco's annual R&D spend as a percentage of revenue?
8. How many days of annual leave does a new Elanco employee get in their first two years?
9. What programming language does Elanco use for new backend microservices?
10. What is the name of Elanco's internal analytics platform?
11. Who leads the Data & AI department at Elanco?
12. What is the MRP of Flexi-Guard for a 5–10 kg dog?
13. What is the vesting schedule for Elanco ESOPs?
14. How many countries does Elanco operate in?
15. What is the name of the mobile app used by Elanco's field sales representatives?

---

## Medium — Combining Two Facts

16. Flexi-Guard was Elanco's first product — what year was it launched, and what efficacy rate did it achieve in field trials?
17. What is the pay structure for most Elanco employees, and how did the FY2024 bonus payout compare to target?
18. Who co-founded Elanco, and what are their current roles in the company?
19. What was Elanco's total revenue target for FY2024 and how much did they actually achieve?
20. Which Elanco product is the fastest-selling launch in company history, and what revenue did it make in its first year?
21. What is Elanco's policy on no-meeting days, and what tool do they use for async communication?
22. The AgroShield FMD Vaccine is supplied to state governments — which states, and what percentage of Livestock revenue does government business represent?
23. What does the Founder's Award include, and who decides the winner?
24. What is NeuroCalm's active ingredient, and what conditions does it treat?
25. How does Elanco's women-in-engineering representation compare to the industry average?

---

## Hard — Cross-File Reasoning

26. If a new engineer joins Elanco in Bengaluru at level L2, what is their path to promotion, how long might it take, and what learning budget do they have to develop skills?
27. Elanco's VetCare Analytics platform uses RAG — what data does it run over, and how does that acquisition fit into Elanco's broader technology strategy?
28. Elanco sells Flexi-Guard through multiple channels. Compare the price a veterinary clinic pays versus the retail price, and explain why the clinic discount exists given the sales strategy.
29. How does Elanco's on-call rotation work, and which internal systems would be most critical to restore first in an outage (based on their customer impact)?
30. How does Elanco's parental leave policy compare to statutory requirements, and what flexible return-to-work options exist?
31. A dairy cooperative in Karnataka wants to buy Mastitis Control products and the FMD vaccine. Who at Elanco would manage this relationship, and through what commercial structure?
32. Elanco's engineering team grew from 42 to 100 between 2022 and 2024. Based on what you know about the tech stack and product roadmap, which areas are they likely hiring for next and why?
33. How does the OKR system connect individual engineering work to company-level objectives? Use the Q4 FY2024–25 OKRs as examples.
34. NeuroCalm is only available in India currently. What does the knowledge base say about its planned international expansion, and what regulatory process is it going through?
35. What is Elanco's competitive advantage against Zoetis and Virbac, and how does the product development strategy support that positioning?

---

## Trick — Not in the Knowledge Base

*(The correct RAG answer to all of these is: "I don't have that information in my knowledge base.")*

36. What is Elanco's stock ticker symbol?
37. Who is Elanco's auditing firm?
38. What is the exact salary band for an L3 engineer at Elanco?
39. Has Elanco ever faced any regulatory action from FSSAI or state veterinary authorities?
40. What is the renewal date for Elanco's GCP enterprise contract?
41. Who are the individual investors in Elanco's Series C round beyond OrbisMed?
42. Does Elanco have an office in Delhi?
43. What is Arjun Dasgupta's educational background?
44. What is the exact headcount of the Companion Animal Sales team in Tamil Nadu specifically?
45. What is Elanco's net profit margin?

---

## Retrieval Quality Notes

When evaluating RAG answers, check:

- **Grounding:** Is every claim in the answer traceable to a specific section of a knowledge base file? The answer should not add facts that aren't there.
- **Refusal quality:** For trick questions, does the bot say "I don't know" cleanly, or does it hallucinate a plausible-sounding answer?
- **Multi-hop reasoning:** For hard questions, which chunks were retrieved? Were the right files pulled, or did the vector search return irrelevant sections?
- **Chunk boundary issues:** Some answers span two headings in the same file — does chunking by heading cause the bot to miss half the answer?
