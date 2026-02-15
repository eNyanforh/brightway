// components/Post.js
import React from "react";
import styled from "styled-components";
import { ThumbsUp, MessageSquare, Repeat, Send} from "lucide-react";

const Card = styled.div`background:#fff; border-radius:12px; padding:16px; box-shadow:0 1px 6px rgba(0,0,0,0.08);`;
const PostHeader = styled.div`display:flex; align-items:flex-start; gap:12px; position:relative;`;
export const AvatarSmall = styled.img`width:40px; height:40px; border-radius:50%;`;
const PostInfo = styled.div`
  h3{margin:0; font-weight:600;}
  span{font-size:0.8rem; color:#4b5563; display:block;}
  p{font-size:0.75rem; color:#9ca3af; margin:0;}
`;
const MoreButton = styled.button`margin-left:auto; border:none; background:none; cursor:pointer; font-size:1.2rem; color:#6b7280;`;
const PostContent = styled.div`margin-top:8px;font-size:1rem; p{margin-bottom:8px;} img{border-radius:12px; width:100%; object-fit:cover;}`;
const PostImage = styled.img``;
const PostStats = styled.div`display:flex; justify-content:space-between; font-size:0.8rem; color:#6b7280; margin-top:6px; div{display:flex; align-items:center; gap:2px;}`;
const PostActions = styled.div`display:flex;font-weight:600; justify-content:space-around; margin-top:6px; border-top:1px solid #e5e7eb; padding-top:6px;`;
const Action = styled.button`display:flex; align-items:center;font-weight:bold;font-family:"Inter"; gap:4px; border:none; background:none; color:#4b5563; cursor:pointer; &:hover{color:#2563eb;}`;

export default function Post({ post }) {
  return (
    <Card>
      <PostHeader>
        <AvatarSmall src={post.user.avatar} />
        <PostInfo>
          <h3>{post.user.name}</h3>
          <span>{post.user.headline}</span>
          <p>{post.time} ago</p>
        </PostInfo>
        <MoreButton>•••</MoreButton>
      </PostHeader>
      <PostContent>
        <p>{post.text}</p>
        {post.image && <PostImage src={post.image} />}
      </PostContent>
      <PostStats>
        {/* <div>
          <ThumbsUp className="h-4 w-4 text-blue-500" />
          <span>{Math.floor(Math.random()*50+1)}</span>
        </div>
        <span>{Math.floor(Math.random()*20+1)} comments</span> */}
      </PostStats>
      <PostActions>
        <Action><ThumbsUp /> Like</Action>
        <Action><MessageSquare /> Comment</Action>
        <Action><Repeat /> Repost</Action>
        <Action><Send /> Share</Action>
      </PostActions>
    </Card>
  );
}
