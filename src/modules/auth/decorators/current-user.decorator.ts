import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { User } from "../../users/entities/user.entity.js";

//instead of req.user in controller we can use @CurrentUser() in parameter of controller method

export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user as User;
    },
);
