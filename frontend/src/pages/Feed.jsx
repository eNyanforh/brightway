// pages/FeedGoodwallFull.js
import React from "react";
import BrightWayLayout from "../components/BrightwayLayout";
import ProfileCard from "../components/ProfileCard";
import StartPost from "../components/StartPost";
import Post from "../components/Post";
import ChallengeSlider from "../components/ChallengeSlider";
import RightSidebar from "../components/RightSidebar";

// Sample posts data
const posts = [
  {
    id: 1,
    user: { name: "Sir George Mulbah Jr.", headline: "CEO at BITS", avatar: "https://media.licdn.com/dms/image/v2/D4E03AQE9sp3Sqv5oUw/profile-displayphoto-shrink_800_800/B4EZVh6lF_HgAg-/0/1741104502020?e=1761177600&v=beta&t=MXc8As3fFy-x1QiILbt_ZEu5BD0RVaexohXKz5cWBHg" },
    time: "2h",
    text: "The array has been rotated (clockwise) k times; find k or the ‘Rotation Count’.",
    image: "https://media.licdn.com/dms/image/v2/D4E22AQH9RydzuxiDYw/feedshare-shrink_2048_1536/B4EZj_HiVkGcAw-/0/1756626823691?e=1761177600&v=beta&t=KUy0Zxzk7DWaW3fkw71gToBb7CkSmRnzHMD2gL8ES-g",
  },
  {
    id: 2,
    user: { name: "Mohammed Konneh", headline: "Graduate Research Student in Chemistry", avatar: "https://media.licdn.com/dms/image/v2/D4D03AQH3T_xCV876vA/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1728243067125?e=1761177600&v=beta&t=5Z1mRg6vQy0rJHtbRHwICH71dKuug28A7RUdZR-Rs3s" },
    time: "5h",
    text: "AI is reshaping the future of work. Here are my thoughts on what’s next...",
    image: "https://media.licdn.com/dms/image/v2/C562DAQFTEKiGVRmQnQ/profile-treasury-image-shrink_1920_1920/profile-treasury-image-shrink_1920_1920/0/1635041493072?e=1759183200&v=beta&t=1acaE3fYY_xVKeAoEvEeLpizDaRU8_PczFBPj2BGDic",
  },
];

export default function FeedGoodwallFull() {
  // Main content column
  const mainContent = (
    <>
      <StartPost />
      <ChallengeSlider />
      {posts.map(post => <Post key={post.id} post={post} />)}
    </>
  );

  return (
    <BrightWayLayout
      leftSidebar={<ProfileCard />}
      mainContent={mainContent}
      rightSidebar={<RightSidebar />}
    />
  );
}
