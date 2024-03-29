import {
  //   HttpException,
  //   HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coffee } from './entities/coffee.entiy';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateCoffeeDto } from './dto/create-coffee.dto';
import { UpdateCoffeeDto } from './dto/update-coffee.dto';
import { Flavor } from './entities/flavor.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto/pagination-query.dto';
import { Event } from '../events/entities/event.entity/event.entity';
@Injectable()
//coffeeService负责管理咖啡相关的业务逻辑，存储、查询、更新、删除等操作
//供coffeesController或者其他地方调用
//通常provider和services处理业务逻辑以及和数据源的交互，controller处理请求
export class CoffeesService {
  constructor(
    @InjectRepository(Coffee)
    private readonly coffeeRepository: Repository<Coffee>,
    @InjectRepository(Flavor)
    private readonly flavorRepository: Repository<Flavor>,
    private readonly connection: DataSource,
  ) {}
  //使用InjectRepository 装饰器，将CoffeeEntity注入到coffeeRepository中，方便后续操作

  findAll(paginationQuery: PaginationQueryDto) {
    const { limit, offset } = paginationQuery;
    return this.coffeeRepository.find({
      relations: ['flavors'],
      skip: offset, //offset 用于设定查询结果的偏移量，即跳过多少条记录后再开始返回结果集。
      take: limit, //limit 用于设定返回结果的数量，即一次返回多少条记录。
    }); //返回所有咖啡数据
  }

  async findOne(id: string) {
    // const coffee = this.coffees.find((coffee) => coffee.id === +id);
    const coffee = await this.coffeeRepository.findOne({
      where: { id: Number(id) },
      relations: ['flavors'],
    }); //返回id对应的咖啡数据
    if (!coffee) {
      //   throw new HttpException(`Coffee #${id} not found`, HttpStatus.NOT_FOUND);
      throw new NotFoundException(`Coffee #${id} not found`);
    }
    return coffee;
    //+id把字符串类型的id转换为数字类型，便于比较
  }
  async create(createCoffeeDto: CreateCoffeeDto) {
    const flavors = await Promise.all(
      createCoffeeDto.flavors.map((name) => {
        return this.preloadFlavorsByName(name);
      }), //等到所有的Promise都执行完毕，才会继续执行
      // createCoffeeDto.flavors.map((name) => this.preloadFlavorsByName(name)),
    );
    const coffee = this.coffeeRepository.create({
      ...createCoffeeDto,
      flavors: flavors,
    });
    this.coffeeRepository.save(coffee);
  }
  async update(id: string, updateCoffeeDto: UpdateCoffeeDto) {
    const flavors =
      updateCoffeeDto.flavors &&
      (await Promise.all(
        updateCoffeeDto.flavors.map((name) => {
          return this.preloadFlavorsByName(name);
        }),
        // updateCoffeeDto.flavors.map((name) => this.preloadFlavorsByName(name)),
      ));
    const coffee = await this.coffeeRepository.preload({
      id: +id,
      ...updateCoffeeDto,
      flavors: flavors,
    });
    if (!coffee) {
      throw new NotFoundException(`Coffee #${id} not found`);
    }
    this.coffeeRepository.save(coffee);
  }
  async remove(id: string) {
    // const index = this.coffees.findIndex((coffee) => coffee.id === +id);
    // if (index >= 0) {
    //   this.coffees.splice(index, 1);
    // }
    const coffee = await this.findOne(id);
    return this.coffeeRepository.remove(coffee);
  }

  async recommendCoffee(coffee: Coffee) {
    const queryRunner = this.connection.createQueryRunner(); //createQueryRunner方法用于创建QueryRunner实例，用于执行数据库事务

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      coffee.recommendations++; //coffee的推荐次数加1
      const recommendEvent = new Event(); //创立一个推荐事件对象
      recommendEvent.name = 'coffee_recommend';
      recommendEvent.type = 'coffee';

      recommendEvent.payload = { coffeeId: coffee.id };
      await queryRunner.manager.save(coffee);
      await queryRunner.manager.save(recommendEvent); //两个保存都成功后，才提交事务，否则回滚事务
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  private async preloadFlavorsByName(name: string): Promise<Flavor> {
    const existingFlavors = await this.flavorRepository.findOne({
      where: { name: name },
    });
    if (existingFlavors) {
      return existingFlavors;
    } //如果存在，则直接返回，否则创建新的Flavor
    return this.flavorRepository.create({ name });
  }
}
